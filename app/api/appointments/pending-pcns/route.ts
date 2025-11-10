import { NextRequest, NextResponse } from 'next/server'
import { withPrisma } from '@/lib/db'
import { getEffectiveUser } from '@/lib/auth'
import { getCompanyTimezone } from '@/lib/timezone'

export async function GET(request: NextRequest) {
  try {
    const user = await getEffectiveUser()
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get query parameters
    const url = new URL(request.url)
    const limit = url.searchParams.get('limit')
    const all = url.searchParams.get('all') === 'true'

    const result = await withPrisma(async (prisma) => {
      const company = await prisma.company.findUnique({
        where: { id: user.companyId },
        select: { timezone: true }
      })
      const timezone = getCompanyTimezone(company)

      const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000)
      
      const whereClause: any = {
        companyId: user.companyId,
        pcnSubmitted: false,
        scheduledAt: {
          lte: tenMinutesAgo
        },
        // Only include appointments with status "scheduled"
        // All other statuses (signed, showed, no_show, cancelled, rescheduled) should not need PCNs
        status: 'scheduled',
        // Only include appointments that should be counted (flag = 1 or null for backwards compatibility)
        // Exclude appointments with flag = 0 (superseded)
        AND: [
          {
            OR: [
              { appointmentInclusionFlag: 1 },
              { appointmentInclusionFlag: null } // Include null for appointments not yet calculated (backwards compatibility)
            ]
          }
        ]
      }

      // Reps only see their own appointments
      if (user.role !== 'admin' && !user.superAdmin) {
        whereClause.closerId = user.id
      }

      // Get total count first
      const totalCount = await prisma.appointment.count({
        where: whereClause
      })

      // Determine limit
      let takeLimit: number | undefined = undefined
      if (!all) {
        if (limit) {
          takeLimit = parseInt(limit, 10)
        } else {
          takeLimit = 50 // Default limit for dashboard widget
        }
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
        ...(takeLimit !== undefined && { take: takeLimit })
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
        totalCount,
        appointments: formatted,
        timezone
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

