import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { withPrisma } from '@/lib/db'
import { GHLClient } from '@/lib/ghl-api'

// Sync calendars from GHL
export async function POST(request: Request) {
  try {
    const user = await requireAdmin()
    
    const company = await withPrisma(async (prisma) => {
      return await prisma.company.findUnique({
        where: { id: user.companyId }
      })
    })
    
    if (!company?.ghlApiKey) {
      return NextResponse.json(
        { error: 'GHL not configured. Please set up your API key first.' },
        { status: 400 }
      )
    }
    
    // Fetch calendars from GHL
    const ghl = new GHLClient(company.ghlApiKey, company.ghlLocationId || undefined)
    const calendars = await ghl.getCalendars()
    
    console.log(`Syncing ${calendars.length} calendars for company ${user.companyId}`)
    
    // Sync to database
    await withPrisma(async (prisma) => {
      for (const ghlCalendar of calendars) {
        await prisma.calendar.upsert({
          where: { ghlCalendarId: ghlCalendar.id },
          create: {
            companyId: user.companyId,
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
      }
    })
    
    return NextResponse.json({
      success: true,
      count: calendars.length
    })
    
  } catch (error: any) {
    console.error('Calendar sync error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// Get all synced calendars
export async function GET() {
  try {
    const user = await requireAdmin()
    
    const calendars = await withPrisma(async (prisma) => {
      return await prisma.calendar.findMany({
        where: { companyId: user.companyId },
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
