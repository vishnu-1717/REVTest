import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { withPrisma } from '@/lib/db'
import { GHLClient } from '@/lib/ghl-api'

// Save GHL credentials
export async function POST(request: Request) {
  try {
    const user = await requireAdmin()
    const { apiKey, locationId } = await request.json()
    
    if (!apiKey || !locationId) {
      return NextResponse.json(
        { error: 'API key and location ID are required' },
        { status: 400 }
      )
    }
    
    // Test the API key by trying to fetch calendars
    try {
      const ghl = new GHLClient(apiKey)
      await ghl.getCalendars()
    } catch (error) {
      return NextResponse.json(
        { error: 'Invalid API key or location ID' },
        { status: 400 }
      )
    }
    
    // Update company with GHL credentials
    await withPrisma(async (prisma) => {
      return await prisma.company.update({
        where: { id: user.companyId },
        data: {
          ghlApiKey: apiKey,
          ghlLocationId: locationId
        }
      })
    })
    
    return NextResponse.json({ success: true })
    
  } catch (error: any) {
    console.error('GHL setup error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// Get current GHL setup status
export async function GET() {
  try {
    const user = await requireAdmin()
    
    const company = await withPrisma(async (prisma) => {
      return await prisma.company.findUnique({
        where: { id: user.companyId },
        select: {
          ghlApiKey: true,
          ghlLocationId: true,
          attributionStrategy: true,
          attributionSourceField: true,
          useCalendarsForAttribution: true
        }
      })
    })
    
    return NextResponse.json({
      configured: !!company?.ghlApiKey,
      locationId: company?.ghlLocationId,
      attributionStrategy: company?.attributionStrategy,
      attributionSourceField: company?.attributionSourceField,
      useCalendarsForAttribution: company?.useCalendarsForAttribution
    })
    
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
