import { NextResponse } from 'next/server'
import { prisma } from '@/lib/lib/prisma'
import crypto from 'crypto'

export async function POST(request: Request) {
  try {
    const { companyName, email, processor } = await request.json()
    
    // Generate a unique webhook secret for this company
    const webhookSecret = crypto.randomBytes(32).toString('hex')
    
    // Use raw SQL to bypass prepared statement issues
    const result = await prisma.$queryRaw`
      INSERT INTO "Company" (id, name, email, processor, "processorAccountId", "createdAt", "updatedAt")
      VALUES (gen_random_uuid(), ${companyName}, ${email}, ${processor}, ${webhookSecret}, NOW(), NOW())
      ON CONFLICT (email) 
      DO UPDATE SET 
        name = EXCLUDED.name,
        processor = EXCLUDED.processor,
        "processorAccountId" = EXCLUDED."processorAccountId",
        "updatedAt" = NOW()
      RETURNING id, name, email, processor, "processorAccountId"
    `
    
    const company = Array.isArray(result) ? result[0] : result
    
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
