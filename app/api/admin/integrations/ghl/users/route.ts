import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { withPrisma } from '@/lib/db'
import { GHLClient } from '@/lib/ghl-api'

// Fetch GHL users for mapping
export async function GET() {
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
    
    // Fetch users from GHL
    const ghl = new GHLClient(company.ghlApiKey, company.ghlLocationId || undefined)
    const users = await ghl.getUsers()
    
    console.log(`Fetched ${users.length} GHL users for company ${user.companyId}`)
    
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

