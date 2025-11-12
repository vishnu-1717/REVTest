import { NextRequest, NextResponse } from 'next/server'
import { withPrisma } from '@/lib/db'
import { getEffectiveUser } from '@/lib/auth'
import { getEffectiveCompanyId } from '@/lib/company-context'
import { getCompanyTimezone } from '@/lib/timezone'
import { Prisma } from '@prisma/client'

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
    const closerId = url.searchParams.get('closerId')
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

      const dateFrom = parseDateParam(dateFromParam)
      const dateTo = parseDateParam(dateToParam, true)

      const baseWhereClause: Prisma.AppointmentWhereInput = {
        companyId: effectiveCompanyId,
        pcnSubmitted: true,
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

      if (dateFrom || dateTo) {
        baseWhereClause.pcnSubmittedAt = {}
        if (dateFrom) {
          baseWhereClause.pcnSubmittedAt.gte = dateFrom
        }
        if (dateTo) {
          baseWhereClause.pcnSubmittedAt.lte = dateTo
        }
      }

      if (closerId && closerId.trim().length > 0) {
        baseWhereClause.closerId = closerId === 'unassigned' ? null : closerId
      }

      const appointments = await prisma.appointment.findMany({
        where: baseWhereClause,
        include: {
          contact: { select: { name: true } },
          closer: { select: { id: true, name: true } }
        },
        orderBy: { pcnSubmittedAt: 'desc' },
        take: limit
      })

      const totalCount = await prisma.appointment.count({
        where: baseWhereClause
      })

      const formatted = appointments.map((apt) => ({
        id: apt.id,
        scheduledAt: apt.scheduledAt.toISOString(),
        pcnSubmittedAt: apt.pcnSubmittedAt?.toISOString() || null,
        contactName: apt.contact?.name || 'Unknown contact',
        closerId: apt.closerId,
        closerName: apt.closer?.name || 'Unassigned',
        status: apt.status,
        outcome: apt.outcome,
        cashCollected: apt.cashCollected || null,
        notes: apt.notes || null
      }))

      const closers = await prisma.user.findMany({
        where:
          user.superAdmin || user.role === 'admin'
            ? {
                companyId: effectiveCompanyId,
                isActive: true,
                superAdmin: false,
                OR: [
                  { role: { in: ['rep', 'closer'] } },
                  { AppointmentsAsCloser: { some: {} } }
                ]
              }
            : { id: user.id },
        select: {
          id: true,
          name: true
        },
        orderBy: { name: 'asc' }
      })

      return {
        appointments: formatted,
        totalCount,
        timezone,
        closers: closers.map((closer) => ({
          id: closer.id,
          name: closer.name || 'Unnamed rep'
        }))
      }
    })

    return NextResponse.json(result)
  } catch (error: any) {
    console.error('[API] Error fetching completed PCNs:', error)
    return NextResponse.json(
      { error: 'Failed to fetch completed PCNs', details: error.message },
      { status: 500 }
    )
  }
}

