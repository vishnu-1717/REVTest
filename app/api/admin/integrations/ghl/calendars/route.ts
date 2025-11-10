import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { withPrisma } from '@/lib/db'
import { GHLClient } from '@/lib/ghl-api'
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
    
    const company = await withPrisma(async (prisma) => {
      return await prisma.company.findUnique({
        where: { id: companyId }
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
    
    console.log(`Syncing ${calendars.length} calendars for company ${companyId}`)
    
    // Sync to database
    await withPrisma(async (prisma) => {
      for (const ghlCalendar of calendars) {
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
