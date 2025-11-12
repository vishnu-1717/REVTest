import { NextRequest, NextResponse } from 'next/server'
import { withPrisma } from '@/lib/db'
import { getEffectiveUser } from '@/lib/auth'
import { getEffectiveCompanyId } from '@/lib/company-context'
import { getCompanyTimezone } from '@/lib/timezone'
import { Prisma } from '@prisma/client'

type CalendarOption = {
  key: string
  label: string
}

type CloserOption = {
  id: string
  name: string
}

const CALENDAR_KEY_PREFIX_ID = 'id:'
const CALENDAR_KEY_PREFIX_NAME = 'name:'
const CALENDAR_KEY_NONE = 'none'

function parseDateParam(value: string | null, endOfDay = false): Date | null {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  if (endOfDay) {
    date.setHours(23, 59, 59, 999)
  } else {
    date.setHours(0, 0, 0, 0)
  }
  return date
}

export async function GET(request: NextRequest) {
  try {
    const user = await getEffectiveUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const url = new URL(request.url)
    const closerIdParam = url.searchParams.get('closerId')
    const calendarParam = url.searchParams.get('calendar')
    const dateFromParam = url.searchParams.get('dateFrom')
    const dateToParam = url.searchParams.get('dateTo')
    const limitParam = url.searchParams.get('limit')
    const limit = limitParam ? Math.max(parseInt(limitParam, 10), 1) : 200

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

      const now = new Date()
      const tenMinutesAgo = new Date(now.getTime() - 10 * 60 * 1000)

      const dateFrom = parseDateParam(dateFromParam)
      const dateTo = parseDateParam(dateToParam, true)

      const effectiveDateFrom =
        dateFrom && dateFrom > tenMinutesAgo ? dateFrom : tenMinutesAgo
      const effectiveDateTo = dateTo || undefined

      const baseWhereClause: Prisma.AppointmentWhereInput = {
        companyId: effectiveCompanyId,
        status: 'scheduled',
        pcnSubmitted: false,
        scheduledAt: {
          gte: effectiveDateFrom,
          ...(effectiveDateTo ? { lte: effectiveDateTo } : {})
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

      const listWhereClause: Prisma.AppointmentWhereInput = { ...baseWhereClause }

      if (typeof closerIdParam === 'string' && closerIdParam.trim().length > 0) {
        if (closerIdParam === 'unassigned') {
          listWhereClause.closerId = null
        } else {
          listWhereClause.closerId = closerIdParam
        }
      }

      if (typeof calendarParam === 'string' && calendarParam.trim().length > 0) {
        if (calendarParam === CALENDAR_KEY_NONE) {
          listWhereClause.calendarId = null
        } else if (calendarParam.startsWith(CALENDAR_KEY_PREFIX_ID)) {
          listWhereClause.calendarId = calendarParam.slice(CALENDAR_KEY_PREFIX_ID.length)
        } else if (calendarParam.startsWith(CALENDAR_KEY_PREFIX_NAME)) {
          listWhereClause.calendar = calendarParam.slice(CALENDAR_KEY_PREFIX_NAME.length)
        }
      }

      type UpcomingAppointmentWithRelations = Prisma.AppointmentGetPayload<{
        include: {
          contact: { select: { name: true } }
          closer: { select: { id: true, name: true } }
          calendarRelation: { select: { name: true } }
        }
      }>

      const upcomingAppointments: UpcomingAppointmentWithRelations[] =
        await prisma.appointment.findMany({
          where: listWhereClause,
          include: {
            contact: { select: { name: true } },
            closer: { select: { id: true, name: true } },
            calendarRelation: { select: { name: true } }
          },
          orderBy: {
            scheduledAt: 'asc'
          },
          take: limit
        })

      const totalCount = await prisma.appointment.count({
        where: listWhereClause
      })

      const closerQueryBase: Prisma.UserWhereInput =
        user.role === 'admin' || user.superAdmin
          ? {
              companyId: effectiveCompanyId,
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
        },
        orderBy: { name: 'asc' }
      })

      const calendarGroups = await prisma.appointment.groupBy({
        by: ['calendarId', 'calendar'],
        where: baseWhereClause,
        _count: { _all: true }
      })

      const calendarIds = calendarGroups
        .map((group) => group.calendarId)
        .filter((id): id is string => !!id)

      const calendarsFromDb = calendarIds.length
        ? await prisma.calendar.findMany({
            where: { id: { in: calendarIds } },
            select: { id: true, name: true }
          })
        : []

      const calendarOptionsMap = new Map<string, CalendarOption>()

      calendarGroups.forEach((group) => {
        if (group.calendarId) {
          const calendarRecord = calendarsFromDb.find(
            (cal) => cal.id === group.calendarId
          )
          const label =
            calendarRecord?.name ||
            group.calendar ||
            `Calendar ${calendarOptionsMap.size + 1}`
          calendarOptionsMap.set(group.calendarId, {
            key: `${CALENDAR_KEY_PREFIX_ID}${group.calendarId}`,
            label
          })
        } else {
          const label = group.calendar || 'Unassigned'
          calendarOptionsMap.set(
            `${CALENDAR_KEY_PREFIX_NAME}${label}`,
            {
              key:
                label === 'Unassigned'
                  ? CALENDAR_KEY_NONE
                  : `${CALENDAR_KEY_PREFIX_NAME}${label}`,
              label
            }
          )
        }
      })

      const formattedAppointments = upcomingAppointments.map((apt) => ({
        id: apt.id,
        scheduledAt: apt.scheduledAt.toISOString(),
        contactName: apt.contact?.name || 'Unknown contact',
        closerId: apt.closerId,
        closerName: apt.closer?.name || null,
        calendarId: apt.calendarId || null,
        calendarName: apt.calendarRelation?.name || apt.calendar || 'Unassigned',
        timezone
      }))

      const closerOptions: CloserOption[] = closers.map((closer) => ({
        id: closer.id,
        name: closer.name || 'Unnamed Rep'
      }))

      const calendarOptions: CalendarOption[] = Array.from(
        calendarOptionsMap.values()
      ).sort((a, b) => a.label.localeCompare(b.label))

      return {
        appointments: formattedAppointments,
        totalCount,
        timezone,
        closers: closerOptions,
        calendars: calendarOptions
      }
    })

    if (result && typeof result === 'object' && 'error' in result) {
      return NextResponse.json(result, { status: 400 })
    }

    return NextResponse.json(result)
  } catch (error: any) {
    console.error('[API] Error fetching upcoming appointments:', error)
    return NextResponse.json(
      { error: 'Failed to fetch upcoming appointments', details: error.message },
      { status: 500 }
    )
  }
}

