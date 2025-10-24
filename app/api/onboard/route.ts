import { NextResponse } from 'next/server'
import { withPrisma } from '@/lib/db'
import crypto from 'crypto'

export async function POST(request: Request) {
  try {
    const { companyName, email, processor } = await request.json()
    
    // Generate a unique webhook secret for this company
    const webhookSecret = crypto.randomBytes(32).toString('hex')
    
    // Use raw SQL to avoid prepared statement conflicts with Supabase transaction pooler
    const company = await withPrisma(async (prisma) => {
      // First try to find existing company
      const existing = await prisma.$queryRaw`
        SELECT id, name, email, processor, "processorAccountId" 
        FROM "Company" 
        WHERE email = ${email}
      `
      
      if (Array.isArray(existing) && existing.length > 0) {
        // Update existing company
        await prisma.$queryRaw`
          UPDATE "Company" 
          SET name = ${companyName}, 
              processor = ${processor}, 
              "processorAccountId" = ${webhookSecret},
              "updatedAt" = NOW()
          WHERE email = ${email}
        `
        return existing[0]
      } else {
        // Create new company
        const result = await prisma.$queryRaw`
          INSERT INTO "Company" (id, name, email, processor, "processorAccountId", "createdAt", "updatedAt")
          VALUES (gen_random_uuid(), ${companyName}, ${email}, ${processor}, ${webhookSecret}, NOW(), NOW())
          RETURNING id, name, email, processor, "processorAccountId"
        `
        return Array.isArray(result) ? result[0] : result
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
