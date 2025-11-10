import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { withPrisma } from '@/lib/db'
import { GHLClient } from '@/lib/ghl-api'
import { getEffectiveCompanyId } from '@/lib/company-context'

// Save GHL credentials
export async function POST(request: NextRequest) {
  try {
    const user = await requireAdmin()
    const { apiKey, locationId } = await request.json()
    const companyId = await getEffectiveCompanyId(request.url)
    
    if (!apiKey || !locationId) {
      return NextResponse.json(
        { error: 'API key and location ID are required' },
        { status: 400 }
      )
    }

    if (!user.superAdmin && companyId !== user.companyId) {
      return NextResponse.json(
        { error: 'You do not have permission to modify this company' },
        { status: 403 }
      )
    }
    
    // Test the API key by validating it (checking if it's valid format and has access)
    let timezone = 'UTC'
    try {
      const ghl = new GHLClient(apiKey, locationId)
      
      // First, validate the API key with a simpler endpoint
      const isValid = await ghl.validateApiKey()
      if (!isValid) {
        return NextResponse.json(
          { error: 'Invalid API key. Please check your API key and ensure it has the correct permissions.' },
          { status: 400 }
        )
      }
      
      console.log(`GHL API key validation successful for location ${locationId}`)
      
      // Try to fetch calendars (this may fail if V1 API doesn't support calendars endpoint)
      // But we'll allow setup to proceed even if calendars can't be fetched
      try {
        const calendars = await ghl.getCalendars()
        console.log(`GHL calendars fetch: Found ${calendars.length} calendars`)
      } catch (calendarError: any) {
        // If calendars fail, log warning but don't fail the setup
        // V1 API might not support calendars endpoint
        console.warn(`GHL calendars fetch failed (non-blocking):`, calendarError.message)
      }

      const locationDetails = await ghl.getLocation(locationId)
      if (locationDetails?.timezone) {
        timezone = locationDetails.timezone
        console.log(`[GHL API] Location timezone detected: ${timezone}`)
      } else {
        console.log('[GHL API] Location timezone not provided, defaulting to UTC')
      }
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
        where: { id: companyId },
        data: {
          ghlApiKey: apiKey,
          ghlLocationId: locationId,
          timezone
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
    
    const company = await withPrisma(async (prisma) => {
      return await prisma.company.findUnique({
        where: { id: companyId },
        select: {
          ghlApiKey: true,
          ghlLocationId: true,
          timezone: true,
          attributionStrategy: true,
          attributionSourceField: true,
          useCalendarsForAttribution: true
        }
      })
    })
    
    return NextResponse.json({
      configured: !!company?.ghlApiKey,
      locationId: company?.ghlLocationId,
      timezone: company?.timezone || 'UTC',
      attributionStrategy: company?.attributionStrategy,
      attributionSourceField: company?.attributionSourceField,
      useCalendarsForAttribution: company?.useCalendarsForAttribution
    })
    
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
