import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { withPrisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const user = await requireAdmin()
    const searchParams = request.nextUrl.searchParams
    const query = searchParams.get('q') || ''
    const limit = parseInt(searchParams.get('limit') || '20', 10)
    const recentOnly = searchParams.get('recentOnly') === 'true'
    const paymentDate = searchParams.get('paymentDate') // ISO string

    if (!query || query.trim().length < 2) {
      return NextResponse.json({ appointments: [] })
    }

    const appointments = await withPrisma(async (prisma) => {
      const searchTerm = query.trim()

      // Build date filter for recent appointments
      let dateFilter: any = {}
      if (recentOnly) {
        if (paymentDate) {
          // Filter to appointments within 7 days of payment date
          const paymentDateObj = new Date(paymentDate)
          const sevenDaysBefore = new Date(paymentDateObj)
          sevenDaysBefore.setDate(sevenDaysBefore.getDate() - 7)
          const sevenDaysAfter = new Date(paymentDateObj)
          sevenDaysAfter.setDate(sevenDaysAfter.getDate() + 7)
          
          dateFilter = {
            scheduledAt: {
              gte: sevenDaysBefore,
              lte: sevenDaysAfter,
            },
          }
        } else {
          // Default: last 30 days
          const thirtyDaysAgo = new Date()
          thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
          dateFilter = {
            scheduledAt: {
              gte: thirtyDaysAgo,
            },
          }
        }
      }

      // Search by appointment ID (exact match) - ignore date filter for exact ID matches
      const byId = await prisma.appointment.findFirst({
        where: {
          id: searchTerm,
          companyId: user.companyId,
        },
        include: {
          contact: true,
          closer: true,
        },
      })

      if (byId) {
        return [byId]
      }

      // Search by contact name or email
      const results = await prisma.appointment.findMany({
        where: {
          companyId: user.companyId,
          ...dateFilter,
          OR: [
            {
              contact: {
                name: {
                  contains: searchTerm,
                  mode: 'insensitive',
                },
              },
            },
            {
              contact: {
                email: {
                  contains: searchTerm,
                  mode: 'insensitive',
                },
              },
            },
            {
              closer: {
                name: {
                  contains: searchTerm,
                  mode: 'insensitive',
                },
              },
            },
          ],
        },
        include: {
          contact: true,
          closer: true,
        },
        orderBy: {
          scheduledAt: 'desc',
        },
        take: limit,
      })

      return results
    })

    // Format results for frontend
    const formatted = appointments.map((apt) => ({
      id: apt.id,
      contactName: apt.contact?.name || 'Unknown',
      contactEmail: apt.contact?.email || null,
      closerName: apt.closer?.name || 'Unassigned',
      scheduledAt: apt.scheduledAt.toISOString(),
      cashCollected: apt.cashCollected || null,
      status: apt.status,
    }))

    return NextResponse.json({ appointments: formatted })
  } catch (error: any) {
    console.error('Appointment search error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

