import { NextRequest, NextResponse } from 'next/server'
import { withPrisma } from '@/lib/db'
import { getEffectiveUser } from '@/lib/auth'
import { getCompanyTimezone } from '@/lib/timezone'
import { Prisma } from '@prisma/client'

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
    const closerIdParam = url.searchParams.get('closerId')
    const closerFilter =
      closerIdParam === 'unassigned'
        ? null
        : closerIdParam && closerIdParam.trim().length > 0
          ? closerIdParam
          : undefined

    const result = await withPrisma(async (prisma) => {
      const company = await prisma.company.findUnique({
        where: { id: user.companyId },
        select: { timezone: true }
      })
      const timezone = getCompanyTimezone(company)

      const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000)
      
      const baseWhereClause: Prisma.AppointmentWhereInput = {
        companyId: user.companyId,
        pcnSubmitted: false,
        scheduledAt: {
          lte: tenMinutesAgo
        },
        status: 'scheduled',
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
      
      let takeLimit: number | undefined = undefined
      if (!all && !(groupByCloser && typeof closerFilter === 'undefined')) {
        if (limit) {
          takeLimit = parseInt(limit, 10)
        } else {
          takeLimit = 50
        }
      }
      
      let pendingAppointments: Awaited<ReturnType<typeof prisma.appointment.findMany>> = []
      const shouldFetchAppointments =
        !groupByCloser || typeof closerFilter !== 'undefined' || all

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

      let byCloser: Array<{
        closerId: string | null
        closerName: string
        pendingCount: number
        oldestMinutes: number | null
        urgencyLevel: 'normal' | 'medium' | 'high'
      }> | undefined = undefined

      if (groupByCloser) {
        const groupResults = await prisma.appointment.groupBy({
          by: ['closerId'],
          where: baseWhereClause,
          _count: { _all: true },
          _min: { scheduledAt: true }
        })

        const closerQueryBase: Prisma.UserWhereInput =
          user.role === 'admin' || user.superAdmin
            ? {
                companyId: user.companyId,
                isActive: true,
                superAdmin: false,
                OR: [
                  { role: { in: ['rep', 'closer'] } },
                  { AppointmentsAsCloser: { some: {} } }
                ]
              }
            : { id: user.id }

        const closers = await prisma.user.findMany({
          where: closerQueryBase,
          select: {
            id: true,
            name: true
          }
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

        byCloser = closers.map((closer) => {
          const summary = groupMap.get(closer.id) || null
          const oldestMinutes =
            summary && summary._min.scheduledAt
              ? Math.floor((now - summary._min.scheduledAt.getTime()) / (1000 * 60))
              : null

          return {
            closerId: closer.id,
            closerName: closer.name || 'Unknown rep',
            pendingCount: summary ? summary._count._all : 0,
            oldestMinutes,
            urgencyLevel: computeUrgency(oldestMinutes)
          }
        })

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

        byCloser.sort((a, b) => {
          if (b.pendingCount !== a.pendingCount) {
            return b.pendingCount - a.pendingCount
          }
          return a.closerName.localeCompare(b.closerName)
        })
      }

      return {
        count: formatted.length,
        totalCount,
        appointments: formatted,
        timezone,
        byCloser
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

