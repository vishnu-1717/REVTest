import { NextResponse } from 'next/server'
import { auth, currentUser } from '@clerk/nextjs/server'
import { withPrisma } from '@/lib/db'
import crypto from 'crypto'
import { SUPER_ADMIN_EMAILS } from '@/lib/constants'

export async function POST(request: Request) {
  try {
    const { companyName, processor } = await request.json()
    
    // Get the authenticated Clerk user
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    const clerkUser = await currentUser()
    if (!clerkUser) {
      return NextResponse.json({ error: 'Unable to load Clerk user' }, { status: 401 })
    }
    
    const primaryEmail =
      clerkUser.emailAddresses.find((email) => email.id === clerkUser.primaryEmailAddressId)?.emailAddress ??
      clerkUser.emailAddresses[0]?.emailAddress ??
      null
    
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
      
      const existingUser = await prisma.user.findFirst({
        where: { clerkId: userId }
      })
      
      const isSuperAdminEmail = primaryEmail ? SUPER_ADMIN_EMAILS.includes(primaryEmail) : false
      
      if (existingUser) {
        await prisma.user.update({
          where: { id: existingUser.id },
          data: {
            companyId: company.id,
            role: 'admin',
            superAdmin: existingUser.superAdmin || isSuperAdminEmail,
            isActive: true
          }
        })
      } else if (primaryEmail) {
        await prisma.user.create({
          data: {
            name: clerkUser.fullName || primaryEmail.split('@')[0],
            email: primaryEmail,
            role: 'admin',
            companyId: company.id,
            clerkId: userId,
            superAdmin: isSuperAdminEmail,
            isActive: true
          }
        })
      }
      
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
