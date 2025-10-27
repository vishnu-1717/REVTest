import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { withPrisma } from '@/lib/db'
import crypto from 'crypto'

export async function POST(request: Request) {
  try {
    const { companyName, processor } = await request.json()
    
    // Get the authenticated Clerk user
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    // Generate a unique webhook secret for this company
    const webhookSecret = crypto.randomBytes(32).toString('hex')
    // Generate invite code
    const inviteCode = crypto.randomBytes(8).toString('hex').toUpperCase()
    
    const result = await withPrisma(async (prisma) => {
      // Create company
      const company = await prisma.company.create({
        data: {
          name: companyName,
          email: `company-${crypto.randomBytes(8).toString('hex')}@paymaestro.com`, // Temporary
          processor: processor,
          processorAccountId: webhookSecret,
          inviteCode,
        }
      })
      
      // TODO: Get Clerk user details and create admin user
      // For now, create a placeholder admin user
      // In production, you'd sync Clerk user data
      
      return company
    })
    
    // Generate their unique webhook URL
    const webhookUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/${processor}?company=${result.id}&secret=${webhookSecret}`
    
    return NextResponse.json({
      success: true,
      companyId: result.id,
      webhookUrl: webhookUrl,
      inviteCode: inviteCode,
    })
    
  } catch (error) {
    console.error('Onboard error:', error)
    return NextResponse.json(
      { error: 'Failed to create company', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
