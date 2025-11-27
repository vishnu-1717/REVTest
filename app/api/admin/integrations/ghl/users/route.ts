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
    const users = await ghl.getUsers()
    
    console.log(`Fetched ${users.length} GHL users for company ${companyId}`)
    
    return NextResponse.json({
      success: true,
      users: users.map((u: any) => ({
        id: u.id,
        name: u.name || u.firstName + ' ' + u.lastName || 'Unknown',
        email: u.email || '',
        role: u.role || ''
      }))
    })
    
  } catch (error: any) {
    console.error('GHL users fetch error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

