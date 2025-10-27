import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { withPrisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    const user = await requireAuth()
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    // Get date range from query params
    const url = new URL(request.url)
    const dateFrom = url.searchParams.get('dateFrom')
    const dateTo = url.searchParams.get('dateTo')
    
    const result = await withPrisma(async (prisma) => {
      const dateFilter: any = {}
      if (dateFrom) dateFilter.gte = new Date(dateFrom)
      if (dateTo) dateFilter.lte = new Date(dateTo)
      
      // Get appointments for this rep
      const appointments = await prisma.appointment.findMany({
        where: {
          closerId: user.id,
          ...(Object.keys(dateFilter).length > 0 && {
            scheduledAt: dateFilter
          })
        },
        include: {
          contact: true
        },
        orderBy: {
          scheduledAt: 'desc'
        }
      })
      
      // Get commissions
      const commissions = await prisma.commission.findMany({
        where: {
          repId: user.id
        },
        include: {
          Sale: true
        },
        orderBy: {
          calculatedAt: 'desc'
        }
      })
      
      // Calculate stats
      const totalAppointments = appointments.length
      const scheduled = appointments.filter(a => a.status !== 'cancelled').length
      const showed = appointments.filter(a => a.status === 'showed' || a.status === 'signed').length
      const signed = appointments.filter(a => a.status === 'signed').length
      const noShows = appointments.filter(a => a.status === 'no_show').length
      
      const showRate = scheduled > 0 ? (showed / scheduled) * 100 : 0
      const closeRate = showed > 0 ? (signed / showed) * 100 : 0
      
      const totalRevenue = appointments.reduce((sum, apt) => sum + (apt.cashCollected || 0), 0)
      
      const totalCommissions = commissions.reduce((sum, com) => sum + Number(com.totalAmount), 0)
      const pendingCommissions = commissions
        .filter(c => c.releaseStatus === 'pending' || c.releaseStatus === 'partial')
        .reduce((sum, com) => sum + (Number(com.totalAmount) - Number(com.releasedAmount)), 0)
      const releasedCommissions = commissions
        .filter(c => c.releaseStatus === 'released')
        .reduce((sum, com) => sum + Number(com.releasedAmount), 0)
      const paidCommissions = commissions
        .filter(c => c.releaseStatus === 'paid')
        .reduce((sum, com) => sum + Number(com.totalAmount), 0)
      
      // Follow-ups needed
      const followUpsNeeded = appointments.filter(a => 
        a.followUpScheduled && 
        a.status !== 'signed' && 
        a.status !== 'cancelled'
      )
      
      const redzoneFollowUps = followUpsNeeded.filter(a => a.nurtureType === 'Redzone (Within 7 Days)')
      
      return {
        totalAppointments,
        scheduled,
        showed,
        signed,
        noShows,
        showRate: Number(showRate.toFixed(1)),
        closeRate: Number(closeRate.toFixed(1)),
        totalRevenue,
        totalCommissions,
        pendingCommissions,
        releasedCommissions,
        paidCommissions,
        followUpsNeeded: followUpsNeeded.length,
        redzoneFollowUps: redzoneFollowUps.length,
        recentAppointments: appointments.slice(0, 5),
        recentCommissions: commissions.slice(0, 5)
      }
    })
    
    return NextResponse.json(result)
    
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
