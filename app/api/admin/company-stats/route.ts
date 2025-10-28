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
    
    // Verify admin permissions
    if (user.role !== 'admin' && !user.superAdmin) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }
    
    // Get date range from query params
    const url = new URL(request.url)
    const dateFrom = url.searchParams.get('dateFrom')
    const dateTo = url.searchParams.get('dateTo')
    
    const result = await withPrisma(async (prisma) => {
      const dateFilter: any = {}
      if (dateFrom) dateFilter.gte = new Date(dateFrom)
      if (dateTo) dateFilter.lte = new Date(dateTo)
      
      // Get all appointments for this company
      const appointments = await prisma.appointment.findMany({
        where: {
          companyId: user.companyId,
          ...(Object.keys(dateFilter).length > 0 && {
            scheduledAt: dateFilter
          })
        },
        include: {
          contact: true,
          closer: true
        },
        orderBy: {
          scheduledAt: 'desc'
        }
      })
      
      // Get all commissions for the company
      const commissions = await prisma.commission.findMany({
        where: {
          companyId: user.companyId
        },
        include: {
          Sale: true,
          User: true
        },
        orderBy: {
          calculatedAt: 'desc'
        }
      })
      
      // Get all active reps in the company
      const activeReps = await prisma.user.findMany({
        where: {
          companyId: user.companyId,
          role: {
            in: ['rep', 'closer', 'setter']
          }
        }
      })
      
      // Calculate stats
      const totalAppointments = appointments.length
      const scheduled = appointments.filter((a: any) => a.status !== 'cancelled').length
      const showed = appointments.filter((a: any) => a.status === 'showed' || a.status === 'signed').length
      const signed = appointments.filter((a: any) => a.status === 'signed').length
      const noShows = appointments.filter((a: any) => a.status === 'no_show').length
      
      const showRate = scheduled > 0 ? (showed / scheduled) * 100 : 0
      const closeRate = showed > 0 ? (signed / showed) * 100 : 0
      
      const totalRevenue = appointments.reduce((sum: number, apt: any) => sum + (apt.cashCollected || 0), 0)
      
      const totalCommissions = commissions.reduce((sum: number, com: any) => sum + Number(com.totalAmount), 0)
      const pendingCommissions = commissions
        .filter((c: any) => c.releaseStatus === 'pending' || c.releaseStatus === 'partial')
        .reduce((sum: number, com: any) => sum + (Number(com.totalAmount) - Number(com.releasedAmount)), 0)
      const releasedCommissions = commissions
        .filter((c: any) => c.releaseStatus === 'released')
        .reduce((sum: number, com: any) => sum + Number(com.releasedAmount), 0)
      const paidCommissions = commissions
        .filter((c: any) => c.releaseStatus === 'paid')
        .reduce((sum: number, com: any) => sum + Number(com.totalAmount), 0)
      
      // Get rep breakdown
      const repStats: Record<string, any> = {}
      
      for (const rep of activeReps) {
        const repAppointments = appointments.filter((a: any) => a.closerId === rep.id)
        const repCommissions = commissions.filter((c: any) => c.repId === rep.id)
        
        repStats[rep.id] = {
          id: rep.id,
          name: rep.name,
          email: rep.email,
          appointments: repAppointments.length,
          revenue: repAppointments.reduce((sum: number, apt: any) => sum + (apt.cashCollected || 0), 0),
          commissions: repCommissions.reduce((sum: number, com: any) => sum + Number(com.totalAmount), 0),
          showRate: repAppointments.filter((a: any) => a.status !== 'cancelled').length > 0 
            ? (repAppointments.filter((a: any) => a.status === 'showed' || a.status === 'signed').length / repAppointments.filter((a: any) => a.status !== 'cancelled').length) * 100 
            : 0,
          closeRate: repAppointments.filter((a: any) => a.status === 'showed' || a.status === 'signed').length > 0
            ? (repAppointments.filter((a: any) => a.status === 'signed').length / repAppointments.filter((a: any) => a.status === 'showed' || a.status === 'signed').length) * 100
            : 0
        }
      }
      
      // Find top performing rep this month
      const thirtyDaysAgo = new Date()
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
      
      const recentAppointments = appointments.filter((a: any) => 
        new Date(a.scheduledAt) >= thirtyDaysAgo
      )
      
      const monthlyRepStats: Record<string, { revenue: number, appointments: number }> = {}
      for (const apt of recentAppointments) {
        if (apt.closerId) {
          if (!monthlyRepStats[apt.closerId]) {
            monthlyRepStats[apt.closerId] = { revenue: 0, appointments: 0 }
          }
          monthlyRepStats[apt.closerId].revenue += apt.cashCollected || 0
          monthlyRepStats[apt.closerId].appointments += 1
        }
      }
      
      const topPerformer = Object.entries(monthlyRepStats)
        .sort((a, b) => b[1].revenue - a[1].revenue)[0]
      
      const topPerformerInfo = topPerformer ? repStats[topPerformer[0]] : null
      
      // Average deal size
      const completedSales = appointments.filter((a: any) => a.status === 'signed')
      const averageDealSize = completedSales.length > 0
        ? completedSales.reduce((sum: number, apt: any) => sum + (apt.cashCollected || 0), 0) / completedSales.length
        : 0
      
      return {
        totalAppointments,
        scheduled,
        showed,
        signed,
        noShows,
        showRate: Number(showRate.toFixed(1)),
        closeRate: Number(closeRate.toFixed(1)),
        totalRevenue,
        averageDealSize: Number(averageDealSize.toFixed(2)),
        totalCommissions,
        pendingCommissions,
        releasedCommissions,
        paidCommissions,
        activeRepsCount: activeReps.length,
        topPerformer: topPerformerInfo,
        repStats: Object.values(repStats).sort((a: any, b: any) => b.revenue - a.revenue),
        recentAppointments: appointments.slice(0, 5),
        recentCommissions: commissions.slice(0, 5)
      }
    })
    
    return NextResponse.json(result)
    
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

