import { NextRequest, NextResponse } from 'next/server'
import { withPrisma } from '@/lib/db'
import { findAppointmentForPayment, calculateCommission as calcCommission } from '@/lib/payment-matcher'

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
    
    // Get webhook payload
    const body = await request.json()
    
    console.log('Webhook received:', body)
    
    // Use withPrisma to handle webhook processing
    const result = await withPrisma(async (prisma) => {
      // Verify the company exists and secret matches
      const company = await prisma.company.findFirst({
        where: {
          id: companyId,
          processorAccountId: secret,
        }
      })
      
      if (!company) {
        throw new Error('Invalid company or secret')
      }
      
      // Extract payment data from webhook
      const eventType = body.action || body.type || body.event
      
      console.log('Event type:', eventType)
      
      // Only process payment success events
      if (eventType !== 'payment.succeeded' && eventType !== 'payment_succeeded' && eventType !== 'checkout.completed') {
        console.log('Ignoring non-payment event:', eventType)
        return { received: true, skipped: true }
      }
      
      // Store webhook event
      const webhookEvent = await prisma.webhookEvent.create({
        data: {
          processor: 'whop',
          eventType: eventType,
          payload: body,
          processed: false,
          companyId: company.id,
        },
      })
      
      try {
        // Extract payment data from webhook
        const paymentData = {
          externalId: body.id || body.payment_id || body.data?.id,
          amount: body.final_amount ? body.final_amount / 100 : (body.amount ? body.amount / 100 : body.data?.amount / 100),
          currency: body.currency || 'USD',
          customerEmail: body.email || body.customer_email || body.data?.email,
          customerName: body.username || body.customer_name || body.data?.username,
          processor: 'whop',
          // Check for appointment ID in metadata
          appointmentId: body.metadata?.appointment_id || body.client_reference_id || body.data?.metadata?.appointment_id
        }
        
        console.log('Payment data:', paymentData)
        
        // Check if payment already processed
        const existingSale = await prisma.sale.findUnique({
          where: { externalId: paymentData.externalId }
        })
        
        if (existingSale) {
          console.log('Payment already processed:', paymentData.externalId)
          await prisma.webhookEvent.update({
            where: { id: webhookEvent.id },
            data: { 
              processed: true,
              processedAt: new Date(),
            },
          })
          return { received: true, duplicate: true }
        }
        
        // Match payment to appointment
        const matchResult = await findAppointmentForPayment(companyId, {
          email: paymentData.customerEmail,
          name: paymentData.customerName,
          amount: paymentData.amount,
          processor: paymentData.processor,
          externalId: paymentData.externalId,
          appointmentId: paymentData.appointmentId
        })
        
        console.log('Match result:', matchResult)
        
        // Create sale record
        const sale = await prisma.sale.create({
          data: {
            amount: paymentData.amount,
            currency: paymentData.currency,
            status: 'paid',
            companyId,
            processor: paymentData.processor,
            externalId: paymentData.externalId,
            customerEmail: paymentData.customerEmail,
            customerName: paymentData.customerName,
            paidAt: new Date(),
            appointmentId: matchResult.appointmentId || null,
            matchedBy: matchResult.method,
            matchConfidence: matchResult.confidence,
            manuallyMatched: false,
            rawData: body
          }
        })
        
        // If we found a match with high confidence, create commission
        if (matchResult.appointmentId && matchResult.confidence >= 0.7) {
          const appointment = await prisma.appointment.findUnique({
            where: { id: matchResult.appointmentId },
            include: {
              closer: {
                include: {
                  commissionRole: true
                }
              }
            }
          })
          
          if (appointment?.closer) {
            // Get commission rate
            const commissionRate = appointment.closer.customCommissionRate 
              || appointment.closer.commissionRole?.defaultRate 
              || 0.10
            
            // Calculate commission (progressive)
            const { totalCommission, releasedCommission } = calcCommission(
              paymentData.amount, // For now, assume this is full amount
              commissionRate,
              paymentData.amount
            )
            
            // Create commission record
            await prisma.commission.create({
              data: {
                amount: releasedCommission,
                totalAmount: totalCommission,
                releasedAmount: releasedCommission,
                percentage: commissionRate,
                status: 'pending',
                releaseStatus: releasedCommission >= totalCommission ? 'released' : 'partial',
                companyId,
                saleId: sale.id,
                repId: appointment.closer.id
              }
            })
            
            console.log('Commission created:', {
              rep: appointment.closer.name,
              amount: releasedCommission,
              rate: commissionRate
            })
            
            // Update payment link status if applicable
            if (paymentData.appointmentId) {
              await prisma.paymentLink.updateMany({
                where: {
                  appointmentId: paymentData.appointmentId,
                  status: 'pending'
                },
                data: {
                  status: 'paid',
                  paidAt: new Date()
                }
              })
            }
          }
        } else {
          // Low confidence or no match - create unmatched payment for review
          await prisma.unmatchedPayment.create({
            data: {
              saleId: sale.id,
              companyId,
              suggestedMatches: matchResult.matches || [],
              status: 'pending'
            }
          })
          
          console.log('Created unmatched payment for review:', {
            saleId: sale.id,
            confidence: matchResult.confidence,
            method: matchResult.method
          })
        }
        
        // Mark as processed
        await prisma.webhookEvent.update({
          where: { id: webhookEvent.id },
          data: { 
            processed: true,
            processedAt: new Date(),
          },
        })
        
        return { received: true, saleId: sale.id, matched: !!matchResult.appointmentId }
        
      } catch (error: any) {
        console.error('Error processing webhook:', error)
        
        // Mark event as processed with error
        await prisma.webhookEvent.update({
          where: { id: webhookEvent.id },
          data: { 
            processed: true,
            processedAt: new Date(),
            error: error.message,
          },
        })
        
        throw error
      }
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
      { error: 'Webhook processing failed', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
