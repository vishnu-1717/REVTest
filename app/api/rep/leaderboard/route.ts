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
    
    const result = await withPrisma(async (prisma) => {
      // Get date range from query params (default to current month)
      const url = new URL(request.url)
      const dateFrom = url.searchParams.get('dateFrom') || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()
      const dateTo = url.searchParams.get('dateTo') || new Date().toISOString()
      
      // Get all active users in company with rep/closer/setter roles
      const users = await prisma.user.findMany({
        where: {
          companyId: user.companyId,
          role: { in: ['rep', 'closer', 'setter'] }
        },
        select: {
          id: true,
          name: true
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
          
          const totalRevenue = appointments.reduce((sum: number, apt: any) => sum + (apt.cashCollected || 0), 0)
          
          return {
            id: rep.id,
            name: rep.name,
            email: '', // Not returned by API anymore
            revenue: totalRevenue,
            commissions: 0, // Not calculated anymore
            appointments: appointments.length,
            signed: appointments.filter((a: any) => a.status === 'signed').length,
            showDetails: false,
            isCurrentUser: rep.id === user.id
          }
        })
      )
      
      // Sort by revenue (descending)
      leaderboard.sort((a, b) => b.revenue - a.revenue)
      
      // Add rank
      const leaderboardWithRank = leaderboard.map((entry, index) => ({
        ...entry,
        rank: index + 1
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
