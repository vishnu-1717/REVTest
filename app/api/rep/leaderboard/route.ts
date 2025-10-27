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
    
    const result = await withPrisma(async (prisma) => {
      // Check if user can view leaderboard
      if (!user.canViewTeamMetrics && user.role !== 'admin' && !user.superAdmin) {
        return {
          error: 'You do not have permission to view the leaderboard',
          status: 403
        }
      }
      
      // Get date range from query params (default to current month)
      const url = new URL(request.url)
      const dateFrom = url.searchParams.get('dateFrom') || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()
      const dateTo = url.searchParams.get('dateTo') || new Date().toISOString()
      
      // Get all active users in company
      const users = await prisma.user.findMany({
        where: {
          companyId: user.companyId,
          isActive: true,
          role: { in: ['rep', 'closer', 'setter'] }
        }
      })
      
      // Get stats for each user
      const leaderboard = await Promise.all(
        users.map(async (rep) => {
          const appointments = await prisma.appointment.findMany({
            where: {
              closerId: rep.id,
              scheduledAt: {
                gte: new Date(dateFrom),
                lte: new Date(dateTo)
              }
            }
          })
          
          const signed = appointments.filter(a => a.status === 'signed')
          const totalRevenue = appointments.reduce((sum, apt) => sum + (apt.cashCollected || 0), 0)
          
          const commissions = await prisma.commission.findMany({
            where: {
              repId: rep.id,
              createdAt: {
                gte: new Date(dateFrom),
                lte: new Date(dateTo)
              }
            }
          })
          
          const totalCommissions = commissions.reduce((sum, com) => sum + com.totalAmount, 0)
          
          return {
            id: rep.id,
            name: rep.name,
            email: rep.email,
            appointments: appointments.length,
            signed: signed.length,
            revenue: totalRevenue,
            commissions: totalCommissions,
            // Only show detailed metrics if user has permission
            showDetails: user.canViewTeamMetrics || user.role === 'admin' || user.superAdmin
          }
        })
      )
      
      // Sort by revenue (descending)
      leaderboard.sort((a, b) => b.revenue - a.revenue)
      
      // Add rank
      const leaderboardWithRank = leaderboard.map((rep, index) => ({
        ...rep,
        rank: index + 1,
        isCurrentUser: rep.id === user.id
      }))
      
      return leaderboardWithRank
    })
    
    // Check if there was an error in the result
    if (result && 'error' in result && 'status' in result) {
      return NextResponse.json({ error: result.error }, { status: result.status as number })
    }
    
    return NextResponse.json(result)
    
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
