import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/lib/prisma'

export async function POST(request: NextRequest) {
  try {
    const { companyName, email, processor } = await request.json()
    
    // Create company in database
    const company = await prisma.company.create({
      data: {
        name: companyName,
        email,
        processor,
        processorAccountId: `temp_${Date.now()}`, // Temporary ID
        processorConnectedAt: new Date(),
      }
    })
    
    // Generate unique webhook URL for this company
    const webhookUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'https://saas-ben-crabbs-projects.vercel.app'}/api/webhooks/${processor}?company=${company.id}`
    
    return NextResponse.json({
      success: true,
      companyId: company.id,
      webhookUrl,
    })
    
  } catch (error) {
    console.error('Onboard error:', error)
    return NextResponse.json(
      { error: 'Failed to create company' },
      { status: 500 }
    )
  }
}
