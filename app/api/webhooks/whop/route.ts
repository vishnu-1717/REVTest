import { NextRequest, NextResponse } from 'next/server'
import { createPrismaClient } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const prisma = createPrismaClient()
  
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
    
    // Verify the company exists and secret matches
    const company = await prisma.company.findFirst({
      where: {
        id: companyId,
        processorAccountId: secret,
      }
    })
    
    if (!company) {
      return NextResponse.json(
        { error: 'Invalid company or secret' },
        { status: 401 }
      )
    }
    
    // Get webhook payload
    const payload = await request.json()
    
    // Store webhook event with company association
    const webhookEvent = await prisma.webhookEvent.create({
      data: {
        processor: 'whop',
        eventType: payload.type || 'unknown',
        payload: payload,
        processed: false,
      },
    })
    
    // Process payment
    if (payload.type === 'payment.succeeded') {
      await handlePaymentSuccess(payload, webhookEvent.id, company.id, prisma)
    }
    
    // Mark as processed
    await prisma.webhookEvent.update({
      where: { id: webhookEvent.id },
      data: { 
        processed: true,
        processedAt: new Date(),
      },
    })
    
    return NextResponse.json({ received: true })
    
  } catch (error) {
    console.error('Webhook error:', error)
    return NextResponse.json(
      { error: 'Webhook processing failed' },
      { status: 500 }
    )
  } finally {
    // Always disconnect the client to prevent connection leaks
    await prisma.$disconnect()
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
  
  // Check for duplicates
  const existingSale = await prisma.sale.findUnique({
    where: { externalId: externalId },
  })
  
  if (existingSale) {
    console.log('Sale already exists:', externalId)
    return existingSale
  }
  
  // Create sale associated with this company
  const sale = await prisma.sale.create({
    data: {
      amount: amount / 100,
      currency: currency,
      status: 'paid',
      processor: 'whop',
      externalId: externalId,
      customerEmail: customer_email,
      customerName: customer_name,
      source: metadata.source || null,
      rawData: payload,
      paidAt: new Date(),
      companyId: companyId, // Associate with the right company!
    },
  })
  
  // Calculate commission
  await calculateCommission(sale, companyId, prisma)
  
  return sale
}

async function calculateCommission(sale: any, companyId: string, prisma: any) {
  const commissionRate = 0.10
  const commissionAmount = sale.amount * commissionRate
  
  // Get or create a default rep for this company
  const rep = await prisma.user.findFirst({
    where: { 
      companyId: companyId,
      role: 'rep'
    },
  })
  
  if (!rep) {
    // Create a default rep if none exists
    const newRep = await prisma.user.create({
      data: {
        name: 'Unassigned Rep',
        email: `rep@company-${companyId.slice(0, 8)}.com`,
        role: 'rep',
        companyId: companyId,
      },
    })
    
    await prisma.commission.create({
      data: {
        amount: commissionAmount,
        percentage: commissionRate * 100,
        status: 'pending',
        saleId: sale.id,
        companyId: companyId,
        repId: newRep.id,
      },
    })
  } else {
    await prisma.commission.create({
      data: {
        amount: commissionAmount,
        percentage: commissionRate * 100,
        status: 'pending',
        saleId: sale.id,
        companyId: companyId,
        repId: rep.id,
      },
    })
  }
}