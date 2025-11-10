import { NextResponse } from 'next/server'
import { getEffectiveUser } from '@/lib/auth'
import { withPrisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    const user = await getEffectiveUser()
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    // Get date range from query params
    const url = new URL(request.url)
    const dateFrom = url.searchParams.get('dateFrom')
    const dateTo = url.searchParams.get('dateTo')
    
    const result = await withPrisma(async (prisma) => {
      const dateFilter: { gte?: Date; lte?: Date } = {}
      if (dateFrom) dateFilter.gte = new Date(dateFrom)
      if (dateTo) dateFilter.lte = new Date(dateTo)

      const baseWhere = {
        OR: [
          { closerId: user.id },
          { setterId: user.id }
        ],
        ...(Object.keys(dateFilter).length > 0 && {
          scheduledAt: dateFilter
        })
      }

      // OPTIMIZED: Use database aggregations instead of loading all appointments
      const [
        totalAppointments,
        scheduled,
        showed,
        signed,
        noShows,
        revenueAgg,
        followUpsNeeded,
        redzoneFollowUps,
        recentAppointmentsForDisplay,
        recentCommissionsForDisplay,
        commissionsTotalAgg,
        commissionsPending,
        commissionsReleased,
        commissionsPaid
      ] = await Promise.all([
        // Total appointments count
        prisma.appointment.count({ where: baseWhere }),

        // Scheduled (not cancelled)
        prisma.appointment.count({
          where: { ...baseWhere, status: { not: 'cancelled' } }
        }),

        // Showed (showed or signed)
        prisma.appointment.count({
          where: { ...baseWhere, status: { in: ['showed', 'signed'] } }
        }),

        // Signed
        prisma.appointment.count({
          where: { ...baseWhere, status: 'signed' }
        }),

        // No shows
        prisma.appointment.count({
          where: { ...baseWhere, status: 'no_show' }
        }),

        // Total revenue
        prisma.appointment.aggregate({
          where: baseWhere,
          _sum: { cashCollected: true }
        }),

        // Follow-ups needed
        prisma.appointment.count({
          where: {
            ...baseWhere,
            followUpScheduled: true,
            status: { notIn: ['signed', 'cancelled'] }
          }
        }),

        // Redzone follow-ups
        prisma.appointment.count({
          where: {
            ...baseWhere,
            followUpScheduled: true,
            status: { notIn: ['signed', 'cancelled'] },
            nurtureType: 'Redzone (Within 7 Days)'
          }
        }),

        // Only fetch 5 most recent appointments for display
        prisma.appointment.findMany({
          where: baseWhere,
          include: {
            contact: true,
            setter: true,
            closer: true,
            calendarRelation: true
          },
          orderBy: { scheduledAt: 'desc' },
          take: 5
        }),

        // Only fetch 5 most recent commissions for display
        prisma.commission.findMany({
          where: { repId: user.id },
          include: { Sale: true },
          orderBy: { calculatedAt: 'desc' },
          take: 5
        }),

        // Commission totals
        prisma.commission.aggregate({
          where: { repId: user.id },
          _sum: { totalAmount: true }
        }),

        // Pending commissions
        prisma.commission.aggregate({
          where: {
            repId: user.id,
            releaseStatus: { in: ['pending', 'partial'] }
          },
          _sum: {
            totalAmount: true,
            releasedAmount: true
          }
        }),

        // Released commissions
        prisma.commission.aggregate({
          where: {
            repId: user.id,
            releaseStatus: 'released'
          },
          _sum: { releasedAmount: true }
        }),

        // Paid commissions
        prisma.commission.aggregate({
          where: {
            repId: user.id,
            releaseStatus: 'paid'
          },
          _sum: { totalAmount: true }
        })
      ])

      // Calculate rates
      const showRate = scheduled > 0 ? (showed / scheduled) * 100 : 0
      const closeRate = showed > 0 ? (signed / showed) * 100 : 0
      const totalRevenue = revenueAgg._sum.cashCollected || 0

      const totalCommissions = Number(commissionsTotalAgg._sum.totalAmount || 0)
      const pendingCommissions =
        Number(commissionsPending._sum.totalAmount || 0) -
        Number(commissionsPending._sum.releasedAmount || 0)
      const releasedCommissions = Number(commissionsReleased._sum.releasedAmount || 0)
      const paidCommissions = Number(commissionsPaid._sum.totalAmount || 0)

      return {
        totalAppointments,
        scheduled,
        showed,
        signed,
        noShows,
        showRate: Number(showRate.toFixed(1)),
        closeRate: Number(closeRate.toFixed(1)),
        totalRevenue: Number(totalRevenue),
        totalCommissions,
        pendingCommissions,
        releasedCommissions,
        paidCommissions,
        followUpsNeeded,
        redzoneFollowUps,
        recentAppointments: recentAppointmentsForDisplay,
        recentCommissions: recentCommissionsForDisplay
      }
    })
    
    return NextResponse.json(result)
    
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
