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

      // OPTIMIZED: Single query to get all appointments with closer info
      // This replaces the N+1 query pattern (1 query for users + N queries for appointments)
      const appointments = await prisma.appointment.findMany({
        where: {
          companyId: user.companyId,
          closerId: { not: null },
          scheduledAt: {
            gte: new Date(dateFrom),
            lte: new Date(dateTo)
          },
          closer: {
            role: { in: ['rep', 'closer', 'setter'] }
          }
        },
        select: {
          id: true,
          closerId: true,
          status: true,
          cashCollected: true,
          closer: {
            select: {
              id: true,
              name: true
            }
          }
        }
      })

      // Group appointments by closer and calculate stats in memory
      const repStatsMap = new Map<string, {
        id: string
        name: string
        revenue: number
        appointments: number
        signed: number
      }>()

      for (const apt of appointments) {
        if (!apt.closer) continue

        const existing = repStatsMap.get(apt.closer.id)
        if (existing) {
          existing.appointments += 1
          existing.revenue += Number(apt.cashCollected || 0)
          if (apt.status === 'signed') existing.signed += 1
        } else {
          repStatsMap.set(apt.closer.id, {
            id: apt.closer.id,
            name: apt.closer.name,
            revenue: Number(apt.cashCollected || 0),
            appointments: 1,
            signed: apt.status === 'signed' ? 1 : 0
          })
        }
      }

      // Convert map to array and add metadata
      const leaderboard = Array.from(repStatsMap.values()).map(rep => ({
        ...rep,
        email: '', // Not returned by API anymore
        commissions: 0, // Not calculated anymore
        showDetails: false,
        isCurrentUser: rep.id === user.id
      }))

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
