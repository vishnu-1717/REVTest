import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { withPrisma } from '@/lib/db'
import { createGHLClient } from '@/lib/ghl-api'
import { getEffectiveCompanyId } from '@/lib/company-context'

// Fetch GHL users for mapping
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

    // Create GHL client (supports both OAuth and API key)
    const ghl = await createGHLClient(companyId)
    
    if (!ghl) {
      return NextResponse.json(
        { error: 'GHL not configured. Please connect GHL via OAuth or set up your API key first.' },
        { status: 400 }
      )
    }
    
    // Fetch users from GHL
    let users: any[] = []
    try {
      users = await ghl.getUsers()
      console.log(`[GHL Users] Fetched ${users.length} users from GHL API for company ${companyId}`)
    } catch (apiError: any) {
      console.error('[GHL Users] Error fetching users from GHL API:', apiError)
      return NextResponse.json({ 
        error: `Failed to fetch users from GHL: ${apiError.message || 'Unknown error'}`,
        details: 'Check server logs for more details. This may indicate an OAuth token issue or API endpoint change.'
      }, { status: 500 })
    }
    
    if (users.length === 0) {
      console.warn(`[GHL Users] No users returned from GHL API. This could mean:`)
      console.warn(`  - GHL API endpoint structure has changed`)
      console.warn(`  - OAuth token lacks required scopes`)
      console.warn(`  - No users exist in GHL account`)
      console.warn(`  - Location ID is incorrect`)
    }
    
    return NextResponse.json({
      success: true,
      users: users.map((u: any) => ({
        id: u.id,
        name: u.name || (u.firstName && u.lastName ? `${u.firstName} ${u.lastName}` : u.firstName || u.lastName || 'Unknown'),
        email: u.email || '',
        role: u.role || ''
      })),
      count: users.length,
      message: users.length === 0 
        ? 'No users found. This may indicate an API issue or no users exist in GHL.'
        : undefined
    })
    
  } catch (error: any) {
    console.error('[GHL Users] Unexpected error:', error)
    return NextResponse.json({ 
      error: error.message || 'Unexpected error during user fetch',
      details: 'Check server logs for more details'
    }, { status: 500 })
  }
}

