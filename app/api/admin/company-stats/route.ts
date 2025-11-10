import { NextResponse } from 'next/server'
import { getEffectiveUser } from '@/lib/auth'
import { withPrisma } from '@/lib/db'
import { getEffectiveCompanyId } from '@/lib/company-context'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    const user = await getEffectiveUser()
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    // Verify admin permissions
    if (user.role !== 'admin' && !user.superAdmin) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }
    
    // Determine company context (respects viewAs for super admins)
    const effectiveCompanyId = await getEffectiveCompanyId(request.url)

    if (!user.superAdmin && effectiveCompanyId !== user.companyId) {
      return NextResponse.json({ error: 'Access denied for this company' }, { status: 403 })
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
        companyId: effectiveCompanyId,
        ...(Object.keys(dateFilter).length > 0 && {
          scheduledAt: dateFilter
        })
      }

      // OPTIMIZED: Use database aggregations instead of loading all data
      // Run all count queries in parallel
      const [
        totalAppointments,
        scheduled,
        showed,
        signed,
        noShows,
        revenueAgg,
        signedRevenueAgg,
        activeReps,
        recentAppointmentsForDisplay,
        recentCommissionsForDisplay
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

        // Signed appointments revenue (for average deal size)
        prisma.appointment.aggregate({
          where: { ...baseWhere, status: 'signed' },
          _sum: { cashCollected: true },
          _count: true
        }),

        // Get active reps
        prisma.user.findMany({
          where: {
            companyId: effectiveCompanyId,
            role: { in: ['rep', 'closer', 'setter'] },
            isActive: true
          },
          select: { id: true, name: true, email: true }
        }),

        // Only fetch 5 most recent appointments for display (not all!)
        prisma.appointment.findMany({
          where: baseWhere,
          include: {
            contact: true,
            closer: true,
            setter: true,
            calendarRelation: true
          },
          orderBy: { scheduledAt: 'desc' },
          take: 5
        }),

        // Only fetch 5 most recent commissions for display
        prisma.commission.findMany({
          where: { companyId: effectiveCompanyId },
          include: { Sale: true },
          orderBy: { calculatedAt: 'desc' },
          take: 5
        })
      ])

      // Calculate rates
      const showRate = scheduled > 0 ? (showed / scheduled) * 100 : 0
      const closeRate = showed > 0 ? (signed / showed) * 100 : 0
      const totalRevenue = revenueAgg._sum.cashCollected || 0
      const averageDealSize = signedRevenueAgg._count > 0
        ? (signedRevenueAgg._sum.cashCollected || 0) / signedRevenueAgg._count
        : 0

      // OPTIMIZED: Get commission stats using database aggregation
      const [commissionsTotalAgg, commissionsPending, commissionsReleased, commissionsPaid] = await Promise.all([
        prisma.commission.aggregate({
          where: { companyId: effectiveCompanyId },
          _sum: { totalAmount: true }
        }),
        prisma.commission.aggregate({
          where: {
            companyId: effectiveCompanyId,
            releaseStatus: { in: ['pending', 'partial'] }
          },
          _sum: {
            totalAmount: true,
            releasedAmount: true
          }
        }),
        prisma.commission.aggregate({
          where: {
            companyId: effectiveCompanyId,
            releaseStatus: 'released'
          },
          _sum: { releasedAmount: true }
        }),
        prisma.commission.aggregate({
          where: {
            companyId: effectiveCompanyId,
            releaseStatus: 'paid'
          },
          _sum: { totalAmount: true }
        })
      ])

      const totalCommissions = Number(commissionsTotalAgg._sum.totalAmount || 0)
      const pendingCommissions =
        Number(commissionsPending._sum.totalAmount || 0) -
        Number(commissionsPending._sum.releasedAmount || 0)
      const releasedCommissions = Number(commissionsReleased._sum.releasedAmount || 0)
      const paidCommissions = Number(commissionsPaid._sum.totalAmount || 0)

      // OPTIMIZED: Get per-rep stats using groupBy instead of loading all data
      const thirtyDaysAgo = new Date()
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

      const [repAppointmentStats, repCommissionStats, monthlyRepRevenue] = await Promise.all([
        // Per-rep appointment stats (all time or filtered)
        prisma.appointment.groupBy({
          by: ['closerId', 'status'],
          where: {
            ...baseWhere,
            closerId: { not: null }
          },
          _count: true,
          _sum: { cashCollected: true }
        }),

        // Per-rep commission stats
        prisma.commission.groupBy({
          by: ['repId'],
          where: { companyId: effectiveCompanyId },
          _sum: { totalAmount: true }
        }),

        // Monthly revenue by rep for top performer
        prisma.appointment.groupBy({
          by: ['closerId'],
          where: {
            companyId: effectiveCompanyId,
            closerId: { not: null },
            scheduledAt: { gte: thirtyDaysAgo }
          },
          _count: true,
          _sum: { cashCollected: true }
        })
      ])

      // Build rep stats from aggregated data
      interface RepStats {
        id: string
        name: string
        email: string
        appointments: number
        revenue: number
        commissions: number
        showRate: number
        closeRate: number
        scheduled: number
        showed: number
        signed: number
      }

      const repStats: Record<string, RepStats> = {}

      // Initialize all active reps
      for (const rep of activeReps) {
        repStats[rep.id] = {
          id: rep.id,
          name: rep.name,
          email: rep.email,
          appointments: 0,
          revenue: 0,
          commissions: 0,
          showRate: 0,
          closeRate: 0,
          scheduled: 0,
          showed: 0,
          signed: 0
        }
      }

      // Fill in appointment stats
      for (const stat of repAppointmentStats) {
        if (!stat.closerId || !repStats[stat.closerId]) continue

        const rep = repStats[stat.closerId]
        rep.appointments += stat._count
        rep.revenue += Number(stat._sum.cashCollected || 0)

        if (stat.status !== 'cancelled') {
          rep.scheduled += stat._count
        }
        if (stat.status === 'showed' || stat.status === 'signed') {
          rep.showed += stat._count
        }
        if (stat.status === 'signed') {
          rep.signed += stat._count
        }
      }

      // Fill in commission stats
      for (const stat of repCommissionStats) {
        if (repStats[stat.repId]) {
          repStats[stat.repId].commissions = Number(stat._sum.totalAmount || 0)
        }
      }

      // Calculate rates for each rep
      for (const rep of Object.values(repStats)) {
        rep.showRate = rep.scheduled > 0 ? (rep.showed / rep.scheduled) * 100 : 0
        rep.closeRate = rep.showed > 0 ? (rep.signed / rep.showed) * 100 : 0
      }

      // Find top performer from monthly data
      let topPerformerInfo: RepStats | null = null
      if (monthlyRepRevenue.length > 0) {
        const topPerformerData = monthlyRepRevenue.reduce((max, curr) =>
          (curr._sum.cashCollected || 0) > (max._sum.cashCollected || 0) ? curr : max
        )

        if (topPerformerData.closerId && repStats[topPerformerData.closerId]) {
          topPerformerInfo = repStats[topPerformerData.closerId]
        }
      }

      return {
        totalAppointments,
        scheduled,
        showed,
        signed,
        noShows,
        showRate: Number(showRate.toFixed(1)),
        closeRate: Number(closeRate.toFixed(1)),
        totalRevenue: Number(totalRevenue),
        averageDealSize: Number(averageDealSize.toFixed(2)),
        totalCommissions,
        pendingCommissions,
        releasedCommissions,
        paidCommissions,
        activeRepsCount: activeReps.length,
        topPerformer: topPerformerInfo,
        repStats: Object.values(repStats)
          .sort((a, b) => b.revenue - a.revenue)
          .map(({ scheduled, showed, signed, ...rest }) => rest), // Remove intermediate counts
        recentAppointments: recentAppointmentsForDisplay,
        recentCommissions: recentCommissionsForDisplay
      }
    })
    
    return NextResponse.json(result)
    
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

