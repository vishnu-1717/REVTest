import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/lib/prisma'

export async function POST(request: NextRequest) {
  try {
    // Get the raw webhook payload
    const payload = await request.json()
    
    console.log('Received Whop webhook:', payload)
    
    // Store the raw webhook event first (audit trail)
    const webhookEvent = await prisma.webhookEvent.create({
      data: {
        processor: 'whop',
        eventType: payload.type || 'unknown',
        payload: payload,
        processed: false,
      },
    })
    
    // Handle different event types
    switch (payload.type) {
      case 'payment.succeeded':
      case 'payment_intent.succeeded':
        await handlePaymentSuccess(payload, webhookEvent.id)
        break
        
      case 'payment.refunded':
        await handlePaymentRefund(payload, webhookEvent.id)
        break
        
      default:
        console.log('Unhandled event type:', payload.type)
    }
    
    // Mark webhook as processed
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
  }
}

async function handlePaymentSuccess(payload: any, webhookEventId: string) {
  // Extract payment data from Whop's payload
  // Note: This is a template - we'll adjust based on Whop's actual structure
  const {
    id: externalId,
    amount,
    currency = 'USD',
    customer_email,
    customer_name,
    metadata = {},
  } = payload.data || payload
  
  // For now, we'll create sales without a company association
  // In production, you'd determine the company from the webhook or metadata
  
  // Check if this sale already exists (prevent duplicates)
  const existingSale = await prisma.sale.findUnique({
    where: { externalId: externalId },
  })
  
  if (existingSale) {
    console.log('Sale already exists:', externalId)
    return existingSale
  }
  
  // Create the sale
  // TODO: Associate with correct company and rep
  const sale = await prisma.sale.create({
    data: {
      amount: amount / 100, // Whop sends amounts in cents
      currency: currency,
      status: 'paid',
      processor: 'whop',
      externalId: externalId,
      customerEmail: customer_email,
      customerName: customer_name,
      source: metadata.source || null,
      rawData: payload,
      paidAt: new Date(),
      
      // TEMPORARY: We'll fix company/rep association later
      // For now, we need to create a test company
      company: {
        connectOrCreate: {
          where: { email: 'test@example.com' },
          create: {
            name: 'Test Company',
            email: 'test@example.com',
            processor: 'whop',
          },
        },
      },
    },
  })
  
  console.log('Created sale:', sale.id)
  
  // Calculate commission (simple 10% for now)
  await calculateCommission(sale)
  
  return sale
}

async function handlePaymentRefund(payload: any, webhookEventId: string) {
  const { id: externalId } = payload.data || payload
  
  // Find the original sale
  const sale = await prisma.sale.findUnique({
    where: { externalId: externalId },
  })
  
  if (!sale) {
    console.log('Sale not found for refund:', externalId)
    return
  }
  
  // Update sale status
  await prisma.sale.update({
    where: { id: sale.id },
    data: { status: 'refunded' },
  })
  
  // TODO: Handle commission clawback
  
  console.log('Processed refund for sale:', sale.id)
}

async function calculateCommission(sale: any) {
  // Simple 10% commission for now
  const commissionRate = 0.10
  const commissionAmount = sale.amount * commissionRate
  
  // Create or find a test rep for now
  const rep = await prisma.user.upsert({
    where: { email: 'rep@example.com' },
    update: {},
    create: {
      name: 'Test Rep',
      email: 'rep@example.com',
      role: 'rep',
      companyId: sale.companyId,
    },
  })
  
  // Create commission record
  const commission = await prisma.commission.create({
    data: {
      amount: commissionAmount,
      percentage: commissionRate * 100,
      status: 'pending',
      saleId: sale.id,
      companyId: sale.companyId,
      repId: rep.id,
    },
  })
  
  console.log('Created commission:', commission.id, `$${commissionAmount}`)
  
  return commission
}
