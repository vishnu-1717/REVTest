import { NextResponse } from 'next/server'
import { prisma } from '@/lib/lib/prisma'
import crypto from 'crypto'

export async function POST(request: Request) {
  const { companyName, email, processor } = await request.json()
  
  // Generate a unique webhook secret for this company
  const webhookSecret = crypto.randomBytes(32).toString('hex')
  
  // Create company in database
  const company = await prisma.company.create({
    data: {
      name: companyName,
      email: email,
      processor: processor,
      processorAccountId: webhookSecret, // We'll use this as their unique identifier
    }
  })
  
  // Generate their unique webhook URL
  const webhookUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/${processor}?company=${company.id}&secret=${webhookSecret}`
  
  return NextResponse.json({
    success: true,
    companyId: company.id,
    webhookUrl: webhookUrl,
  })
}
