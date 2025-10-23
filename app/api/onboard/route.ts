import { NextResponse } from 'next/server'
import { prisma } from '@/lib/lib/prisma'
import crypto from 'crypto'

export async function POST(request: Request) {
  try {
    const { companyName, email, processor } = await request.json()
    
    // Generate a unique webhook secret for this company
    const webhookSecret = crypto.randomBytes(32).toString('hex')
    
    // Create or update company in database
    const company = await prisma.company.upsert({
      where: { email: email },
      update: {
        name: companyName,
        processor: processor,
        processorAccountId: webhookSecret,
      },
      create: {
        name: companyName,
        email: email,
        processor: processor,
        processorAccountId: webhookSecret,
      }
    })
    
    // Generate their unique webhook URL
    const webhookUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/${processor}?company=${company.id}&secret=${webhookSecret}`
    
    return NextResponse.json({
      success: true,
      companyId: company.id,
      webhookUrl: webhookUrl,
    })
    
  } catch (error) {
    console.error('Onboard error:', error)
    return NextResponse.json(
      { error: 'Failed to create company', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
