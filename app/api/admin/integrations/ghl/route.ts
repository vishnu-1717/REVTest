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
      // Pass locationId to GHLClient - GHL V1 API often requires it for proper scoping
      const ghl = new GHLClient(apiKey, locationId)
      const calendars = await ghl.getCalendars()
      console.log(`GHL validation successful: Found ${calendars.length} calendars for location ${locationId}`)
    } catch (error: any) {
      // Log detailed error information for debugging
      console.error('GHL API validation error:', {
        status: error.status,
        message: error.message,
        details: error.details,
        stack: error.stack
      })
      
      // Provide more specific error messages based on status code
      let errorMessage = 'Invalid API key or location ID'
      
      if (error.status === 401) {
        errorMessage = 'Invalid API key. Please check your API key and ensure it has the correct permissions.'
      } else if (error.status === 403) {
        errorMessage = 'API key does not have required permissions. Please ensure your API key has Read/Write access.'
      } else if (error.status === 404) {
        errorMessage = 'GHL API endpoint not found. Please verify your Location ID or contact support.'
      } else if (error.status === 429) {
        errorMessage = 'Rate limit exceeded. Please wait a moment and try again.'
      } else if (error.details) {
        // Include details from GHL API if available
        errorMessage = `GHL API error: ${error.details}`
      } else if (error.message) {
        errorMessage = error.message
      }
      
      return NextResponse.json(
        { error: errorMessage },
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
