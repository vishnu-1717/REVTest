import { NextRequest, NextResponse } from 'next/server'
import { withPrisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    // Get company ID and secret from URL params
    const searchParams = request.nextUrl.searchParams
    const companyId = searchParams.get('company')
    const secret = searchParams.get('secret')
    
    if (!companyId || !secret) {
      return NextResponse.json(
        { error: 'Missing company ID or secret' },
        { status: 401 }
      )
    }
    
    // Use withPrisma to avoid prepared statement conflicts
    const result = await withPrisma(async (prisma) => {
      // Verify the company exists and secret matches using raw SQL
      const companyResult = await prisma.$queryRaw`
        SELECT id, name, email, processor, "processorAccountId"
        FROM "Company"
        WHERE id = ${companyId} AND "processorAccountId" = ${secret}
      `
      
      const company = Array.isArray(companyResult) ? companyResult[0] : companyResult
      if (!company) {
        throw new Error('Invalid company or secret')
      }
      
      // Get webhook payload
      const payload = await request.json()
      
      // Store webhook event using raw SQL
      const webhookEventResult = await prisma.$queryRaw`
        INSERT INTO "WebhookEvent" (id, processor, "eventType", payload, processed, "createdAt")
        VALUES (gen_random_uuid(), 'whop', ${payload.type || 'unknown'}, ${JSON.stringify(payload)}, false, NOW())
        RETURNING id
      `
      const webhookEvent = Array.isArray(webhookEventResult) ? webhookEventResult[0] : webhookEventResult
      
      // Process payment
      if (payload.type === 'payment.succeeded') {
        await handlePaymentSuccess(payload, webhookEvent.id, company.id, prisma)
      }
      
      // Mark as processed using raw SQL
      await prisma.$queryRaw`
        UPDATE "WebhookEvent"
        SET processed = true, "processedAt" = NOW()
        WHERE id = ${webhookEvent.id}
      `
      
      return { received: true }
    })
    
    return NextResponse.json(result)
    
  } catch (error) {
    console.error('Webhook error:', error)
    if (error instanceof Error && error.message === 'Invalid company or secret') {
      return NextResponse.json(
        { error: 'Invalid company or secret' },
        { status: 401 }
      )
    }
    return NextResponse.json(
      { error: 'Webhook processing failed' },
      { status: 500 }
    )
  }
}

async function handlePaymentSuccess(payload: any, webhookEventId: string, companyId: string, prisma: any) {
  const {
    id: externalId,
    amount,
    currency = 'USD',
    customer_email,
    customer_name,
    metadata = {},
  } = payload.data || payload
  
  // Check for duplicates using raw SQL
  const existingSaleResult = await prisma.$queryRaw`
    SELECT id FROM "Sale" WHERE "externalId" = ${externalId}
  `
  
  if (Array.isArray(existingSaleResult) && existingSaleResult.length > 0) {
    console.log('Sale already exists:', externalId)
    return existingSaleResult[0]
  }
  
  // Create sale using raw SQL
  const saleResult = await prisma.$queryRaw`
    INSERT INTO "Sale" (id, amount, currency, status, processor, "externalId", "customerEmail", "customerName", source, "rawData", "paidAt", "companyId", "createdAt", "updatedAt")
    VALUES (gen_random_uuid(), ${amount / 100}, ${currency}, 'paid', 'whop', ${externalId}, ${customer_email}, ${customer_name}, ${metadata.source || null}, ${JSON.stringify(payload)}, NOW(), ${companyId}, NOW(), NOW())
    RETURNING id, amount, currency, status, processor, "externalId", "customerEmail", "customerName", source, "rawData", "paidAt", "companyId"
  `
  
  const sale = Array.isArray(saleResult) ? saleResult[0] : saleResult
  
  // Calculate commission
  await calculateCommission(sale, companyId, prisma)
  
  return sale
}

async function calculateCommission(sale: any, companyId: string, prisma: any) {
  const commissionRate = 0.10
  const commissionAmount = sale.amount * commissionRate
  
  // Get or create a default rep for this company using raw SQL
  const repResult = await prisma.$queryRaw`
    SELECT id FROM "User" 
    WHERE "companyId" = ${companyId} AND role = 'rep'
    LIMIT 1
  `
  
  let repId
  if (Array.isArray(repResult) && repResult.length > 0) {
    repId = repResult[0].id
  } else {
    // Create a default rep if none exists
    const newRepResult = await prisma.$queryRaw`
      INSERT INTO "User" (id, name, email, role, "companyId", "createdAt", "updatedAt")
      VALUES (gen_random_uuid(), 'Unassigned Rep', ${`rep@company-${companyId.slice(0, 8)}.com`}, 'rep', ${companyId}, NOW(), NOW())
      RETURNING id
    `
    repId = Array.isArray(newRepResult) ? newRepResult[0].id : newRepResult.id
  }
  
  // Create commission using raw SQL
  await prisma.$queryRaw`
    INSERT INTO "Commission" (id, amount, percentage, status, "calculatedAt", "saleId", "companyId", "repId", "createdAt", "updatedAt")
    VALUES (gen_random_uuid(), ${commissionAmount}, ${commissionRate * 100}, 'pending', NOW(), ${sale.id}, ${companyId}, ${repId}, NOW(), NOW())
  `
}