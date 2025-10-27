import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { withPrisma } from '@/lib/db'

export async function POST(request: Request) {
  try {
    const { inviteCode } = await request.json()
    
    // Get the authenticated Clerk user
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    const result = await withPrisma(async (prisma) => {
      // Find company by invite code
      const company = await prisma.company.findUnique({
        where: { inviteCode }
      })
      
      if (!company) {
        throw new Error('Invalid invite code')
      }
      
      // TODO: Get Clerk user details and create user in database
      // In production, you'd sync Clerk user data here
      
      return { companyId: company.id, companyName: company.name }
    })
    
    return NextResponse.json({
      success: true,
      companyId: result.companyId,
      message: `Successfully joined ${result.companyName}`
    })
    
  } catch (error) {
    console.error('Join error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to join company' },
      { status: 400 }
    )
  }
}

