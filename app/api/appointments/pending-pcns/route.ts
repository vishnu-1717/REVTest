import { NextRequest, NextResponse } from 'next/server'
import { withPrisma } from '@/lib/db'
import { getEffectiveUser } from '@/lib/auth'

export async function GET(request: NextRequest) {
  try {
    const user = await getEffectiveUser()
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const result = await withPrisma(async (prisma) => {

      const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000)
      
      const whereClause: any = {
        companyId: user.companyId,
        pcnSubmitted: false,
        scheduledAt: {
          lte: tenMinutesAgo
        },
        status: {
          not: 'cancelled'
        }
      }

      // Reps only see their own appointments
      if (user.role !== 'admin' && !user.superAdmin) {
        whereClause.closerId = user.id
      }

      const pendingAppointments = await prisma.appointment.findMany({
        where: whereClause,
        include: {
          contact: {
            select: {
              name: true
            }
          },
          closer: {
            select: {
              name: true
            }
          }
        },
        orderBy: {
          scheduledAt: 'desc'
        },
        take: 50
      })

      const now = Date.now()
      const formatted = pendingAppointments.map(apt => {
        const scheduledTime = new Date(apt.scheduledAt).getTime()
        const minutesSince = Math.floor((now - scheduledTime) / (1000 * 60))
        
        return {
          id: apt.id,
          scheduledAt: apt.scheduledAt.toISOString(),
          contactName: apt.contact.name,
          closerName: apt.closer?.name || null,
          status: apt.status,
          minutesSinceScheduled: minutesSince,
          urgencyLevel: minutesSince > 240 ? 'high' : minutesSince > 120 ? 'medium' : 'normal'
        }
      })

      return {
        count: formatted.length,
        appointments: formatted
      }
    })

    // Check if result is an error response
    if (result && typeof result === 'object' && 'error' in result && 'status' in result) {
      return NextResponse.json({ error: result.error }, { status: result.status as number })
    }

    return NextResponse.json(result)
  } catch (error: any) {
    console.error('[API] Error fetching pending PCNs:', error)
    return NextResponse.json(
      { error: 'Failed to fetch pending PCNs', details: error.message },
      { status: 500 }
    )
  }
}

