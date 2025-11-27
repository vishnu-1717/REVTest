import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { withPrisma } from '@/lib/db'
import { createGHLClient } from '@/lib/ghl-api'
import { getEffectiveCompanyId } from '@/lib/company-context'

// Sync calendars from GHL
export async function POST(request: NextRequest) {
  try {
    const user = await requireAdmin()
    const companyId = await getEffectiveCompanyId(request.url)

    if (!user.superAdmin && companyId !== user.companyId) {
      return NextResponse.json(
        { error: 'You do not have permission to modify this company' },
        { status: 403 }
      )
    }
    
    // Create GHL client (supports both OAuth and API key)
    const ghl = await createGHLClient(companyId)
    
    if (!ghl) {
      return NextResponse.json(
        { error: 'GHL not configured. Please connect GHL via OAuth or set up your API key first.' },
        { status: 400 }
      )
    }
    
    // Fetch calendars from GHL
    let calendars: any[] = []
    try {
      calendars = await ghl.getCalendars()
      console.log(`[Calendar Sync] Fetched ${calendars.length} calendars from GHL API for company ${companyId}`)
    } catch (apiError: any) {
      console.error('[Calendar Sync] Error fetching calendars from GHL API:', apiError)
      return NextResponse.json({ 
        error: `Failed to fetch calendars from GHL: ${apiError.message || 'Unknown error'}`,
        details: 'Check server logs for more details. This may indicate an OAuth token issue or API endpoint change.'
      }, { status: 500 })
    }
    
    if (calendars.length === 0) {
      console.warn(`[Calendar Sync] No calendars returned from GHL API. This could mean:`)
      console.warn(`  - GHL API endpoint structure has changed`)
      console.warn(`  - OAuth token lacks required scopes`)
      console.warn(`  - No calendars exist in GHL account`)
      console.warn(`  - Location ID is incorrect`)
    }
    
    // Sync to database
    let syncedCount = 0
    await withPrisma(async (prisma) => {
      for (const ghlCalendar of calendars) {
        try {
          await prisma.calendar.upsert({
            where: { ghlCalendarId: ghlCalendar.id },
            create: {
              companyId,
              ghlCalendarId: ghlCalendar.id,
              name: ghlCalendar.name,
              description: ghlCalendar.description,
              isActive: ghlCalendar.isActive
            },
            update: {
              name: ghlCalendar.name,
              description: ghlCalendar.description,
              isActive: ghlCalendar.isActive
            }
          })
          syncedCount++
        } catch (dbError: any) {
          console.error(`[Calendar Sync] Error syncing calendar ${ghlCalendar.id}:`, dbError)
        }
      }
    })
    
    return NextResponse.json({
      success: true,
      count: syncedCount,
      fetched: calendars.length,
      message: syncedCount === 0 && calendars.length === 0 
        ? 'No calendars found. This may indicate an API issue or no calendars exist in GHL.'
        : undefined
    })
    
  } catch (error: any) {
    console.error('[Calendar Sync] Unexpected error:', error)
    return NextResponse.json({ 
      error: error.message || 'Unexpected error during calendar sync',
      details: 'Check server logs for more details'
    }, { status: 500 })
  }
}

// Get all synced calendars
export async function GET(request: NextRequest) {
  try {
    const user = await requireAdmin()
    const companyId = await getEffectiveCompanyId(request.url)

    if (!user.superAdmin && companyId !== user.companyId) {
      return NextResponse.json(
        { error: 'You do not have permission to view this company' },
        { status: 403 }
      )
    }
    
    const calendars = await withPrisma(async (prisma) => {
      return await prisma.calendar.findMany({
        where: { companyId },
        include: {
          defaultCloser: {
            select: {
              id: true,
              name: true,
              email: true
            }
          },
          _count: {
            select: {
              appointments: true
            }
          }
        },
        orderBy: { name: 'asc' }
      })
    })
    
    return NextResponse.json(calendars)
    
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
