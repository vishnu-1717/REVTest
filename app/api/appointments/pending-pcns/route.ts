import { NextRequest, NextResponse } from 'next/server'
import { withPrisma } from '@/lib/db'
import { getEffectiveUser } from '@/lib/auth'
import { getCompanyTimezone } from '@/lib/timezone'
import { Prisma } from '@prisma/client'
import { getEffectiveCompanyId } from '@/lib/company-context'

export async function GET(request: NextRequest) {
  try {
    const user = await getEffectiveUser()
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get query parameters
    const url = new URL(request.url)
    const limit = url.searchParams.get('limit')
    const all = url.searchParams.get('all') === 'true'
    const groupByCloser = url.searchParams.get('groupBy') === 'closer'
    const closerIdParamRaw = url.searchParams.get('closerId')
    const closerIdParam =
      closerIdParamRaw && closerIdParamRaw.trim().length > 0 ? closerIdParamRaw.trim() : undefined
    const closerFilterType =
      closerIdParam === 'unassigned'
        ? 'unassigned'
        : closerIdParam === 'inactive'
          ? 'inactive'
          : closerIdParam
            ? 'specific'
            : undefined
    let closerFilter: string | null | undefined
    if (closerFilterType === 'unassigned') {
      closerFilter = null
    } else if (closerFilterType === 'specific' && closerIdParam) {
      closerFilter = closerIdParam
    }

    const effectiveCompanyId = await getEffectiveCompanyId(request.url)

    if (!user.superAdmin && user.companyId !== effectiveCompanyId) {
      return NextResponse.json(
        { error: 'You do not have permission to view this company' },
        { status: 403 }
      )
    }

    const result = await withPrisma(async (prisma) => {
      const company = await prisma.company.findUnique({
        where: { id: effectiveCompanyId },
        select: { timezone: true }
      })
      const timezone = getCompanyTimezone(company)
      const currentTime = new Date()
      const tenMinutesAgo = new Date(currentTime.getTime() - 10 * 60 * 1000)

      // IMPORTANT: We use scheduledAt (not createdAt) to determine if an appointment
      // should appear in pending PCNs. An appointment is "pending" if it was scheduled
      // more than 10 minutes ago, regardless of when it was created in the system.
      const baseWhereClause: Prisma.AppointmentWhereInput = {
        companyId: effectiveCompanyId,
        pcnSubmitted: false,
        status: 'scheduled',
        scheduledAt: {
          lte: tenMinutesAgo
        },
        AND: [
          {
            OR: [
              { appointmentInclusionFlag: 1 },
              { appointmentInclusionFlag: null }
            ]
          }
        ]
      }
      
      if (user.role !== 'admin' && !user.superAdmin) {
        baseWhereClause.closerId = user.id
      }
      
      const totalCount = await prisma.appointment.count({
        where: baseWhereClause
      })
      
      const listWhereClause: Prisma.AppointmentWhereInput = { ...baseWhereClause }
      if (typeof closerFilter !== 'undefined') {
        listWhereClause.closerId = closerFilter
      }
      
      const hasCloserFilter = typeof closerFilter !== 'undefined' || closerFilterType === 'inactive'
      let takeLimit: number | undefined = undefined
      if (!all && !(groupByCloser && !hasCloserFilter)) {
        if (limit) {
          takeLimit = parseInt(limit, 10)
        } else {
          takeLimit = 50
        }
      }
      
      type PendingAppointmentWithRelations = Prisma.AppointmentGetPayload<{
        include: {
          contact: { select: { name: true } }
          closer: { select: { name: true } }
        }
      }>

      let pendingAppointments: PendingAppointmentWithRelations[] = []
      const shouldFetchAppointments = !groupByCloser || hasCloserFilter || all

      if (shouldFetchAppointments) {
        pendingAppointments = await prisma.appointment.findMany({
          where: listWhereClause,
          include: {
            contact: {
              select: {
                name: true
              }
            },
            closer: {
              select: {
                name: true
              }
            }
          },
          orderBy: {
            scheduledAt: 'desc'
          },
          ...(takeLimit !== undefined && { take: takeLimit })
        })
      }

      const now = Date.now()
      const formatted = pendingAppointments.map(apt => {
        const scheduledTime = new Date(apt.scheduledAt).getTime()
        const minutesSince = Math.floor((now - scheduledTime) / (1000 * 60))
        
        return {
          id: apt.id,
          scheduledAt: apt.scheduledAt.toISOString(),
          contactName: apt.contact.name,
          closerId: apt.closerId,
          closerName: apt.closer?.name || null,
          status: apt.status,
          minutesSinceScheduled: minutesSince,
          urgencyLevel: minutesSince > 240 ? 'high' : minutesSince > 120 ? 'medium' : 'normal'
        }
      })

      const assignableCloserWhere: Prisma.UserWhereInput =
        user.role === 'admin' || user.superAdmin
          ? {
              companyId: effectiveCompanyId,
              superAdmin: false,
              OR: [
                { role: { in: ['rep', 'closer', 'admin'] } },
                { AppointmentsAsCloser: { some: {} } }
              ]
            }
          : { id: user.id }

      const assignableClosersRaw = await prisma.user.findMany({
        where: assignableCloserWhere,
        select: { id: true, name: true, isActive: true },
        orderBy: { name: 'asc' }
      })

      const visibleCloserEntries =
        user.role === 'admin' || user.superAdmin
          ? assignableClosersRaw.filter((closer) => closer.isActive)
          : assignableClosersRaw
      const visibleCloserIdSet = new Set(visibleCloserEntries.map((closer) => closer.id))

      let hiddenCloserIdsStorage: string[] = []
      let byCloser: Array<{
        closerId: string | null
        closerName: string
        pendingCount: number
        oldestMinutes: number | null
        urgencyLevel: 'normal' | 'medium' | 'high'
      }> | undefined = undefined

      const shouldGroup =
        groupByCloser || closerFilterType === 'inactive'

      if (shouldGroup) {
        const groupResults = await prisma.appointment.groupBy({
          by: ['closerId'],
          where: baseWhereClause,
          _count: { _all: true },
          _min: { scheduledAt: true }
        })

        const groupMap = new Map<string | null, (typeof groupResults)[number]>()
        groupResults.forEach((entry) => {
          groupMap.set(entry.closerId, entry)
        })

        const computeUrgency = (minutes: number | null) => {
          if (minutes === null) return 'normal'
          if (minutes > 240) return 'high'
          if (minutes > 120) return 'medium'
          return 'normal'
        }

        const hiddenCloserIds = new Set<string>()
        groupResults.forEach((entry) => {
          if (entry.closerId && !visibleCloserIdSet.has(entry.closerId)) {
            hiddenCloserIds.add(entry.closerId)
          }
        })

        if (closerFilterType === 'inactive') {
          hiddenCloserIdsStorage = Array.from(hiddenCloserIds)
          listWhereClause.closerId =
            hiddenCloserIdsStorage.length > 0
              ? { in: hiddenCloserIdsStorage }
              : { in: ['__no_hidden__'] }
        }

        if (groupByCloser) {
          byCloser = visibleCloserEntries
            .map((closer) => {
              const summary = groupMap.get(closer.id) || null
              const oldestMinutes =
                summary && summary._min.scheduledAt
                  ? Math.floor((now - summary._min.scheduledAt.getTime()) / (1000 * 60))
                  : null

              const pendingCount = summary ? summary._count._all : 0

              return pendingCount > 0
                ? {
                    closerId: closer.id,
                    closerName: closer.name || 'Unknown rep',
                    pendingCount,
                    oldestMinutes,
                    urgencyLevel: computeUrgency(oldestMinutes)
                  }
                : null
            })
            .filter(Boolean) as Array<{
              closerId: string
              closerName: string
              pendingCount: number
              oldestMinutes: number | null
              urgencyLevel: 'normal' | 'medium' | 'high'
            }>

          const hiddenSummary = Array.from(hiddenCloserIds).reduce(
            (acc, closerId) => {
              const summary = groupMap.get(closerId)
              if (!summary) return acc
              const minutes =
                summary._min.scheduledAt !== null
                  ? Math.floor((now - summary._min.scheduledAt.getTime()) / (1000 * 60))
                  : null
              acc.pendingCount += summary._count._all
              if (minutes !== null) {
                acc.oldestMinutes =
                  acc.oldestMinutes === null ? minutes : Math.min(acc.oldestMinutes, minutes)
              }
              return acc
            },
            { pendingCount: 0, oldestMinutes: null as number | null }
          )

          const unassignedSummary = groupMap.get(null)
          if (unassignedSummary) {
            const oldestMinutes =
              unassignedSummary._min.scheduledAt
                ? Math.floor((now - unassignedSummary._min.scheduledAt.getTime()) / (1000 * 60))
                : null
            byCloser.push({
              closerId: null,
              closerName: 'Unassigned',
              pendingCount: unassignedSummary._count._all,
              oldestMinutes,
              urgencyLevel: computeUrgency(oldestMinutes)
            })
          }

          if (hiddenSummary.pendingCount > 0) {
            const hiddenMinutes = hiddenSummary.oldestMinutes
            byCloser.push({
              closerId: '__inactive__',
              closerName: 'Inactive / Hidden reps',
              pendingCount: hiddenSummary.pendingCount,
              oldestMinutes: hiddenMinutes,
              urgencyLevel: computeUrgency(hiddenMinutes)
            })
          }

          byCloser.sort((a, b) => {
            if (b.pendingCount !== a.pendingCount) {
              return b.pendingCount - a.pendingCount
            }
            return a.closerName.localeCompare(b.closerName)
          })
        }
      }

      const assignableClosers = assignableClosersRaw.map((closer) => ({
        id: closer.id,
        name: closer.name || 'Unnamed rep'
      }))

      return {
        count: formatted.length,
        totalCount,
        appointments: formatted,
        timezone,
        byCloser,
        assignableClosers,
        hiddenCloserIds: hiddenCloserIdsStorage
      }
    })

    // Check if result is an error response
    if (result && typeof result === 'object' && 'error' in result && 'status' in result) {
      return NextResponse.json({ error: result.error }, { status: result.status as number })
    }

    return NextResponse.json(result)
  } catch (error: any) {
    console.error('[API] Error fetching pending PCNs:', error)
    return NextResponse.json(
      { error: 'Failed to fetch pending PCNs', details: error.message },
      { status: 500 }
    )
  }
}

