import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { withPrisma } from '@/lib/db'
import { calculateCommission } from '@/lib/payment-matcher'

export const dynamic = 'force-dynamic'

interface BulkMatchRequest {
  matches: Array<{
    paymentId: string
    appointmentId: string
  }>
}

export async function POST(request: Request) {
  try {
    const user = await requireAdmin()
    const body: BulkMatchRequest = await request.json()
    
    if (!body.matches || !Array.isArray(body.matches) || body.matches.length === 0) {
      return NextResponse.json({ error: 'Matches array is required' }, { status: 400 })
    }

    const results = await withPrisma(async (prisma) => {
      const processed: Array<{ paymentId: string; success: boolean; error?: string }> = []
      
      for (const match of body.matches) {
        try {
          // Get unmatched payment
          const unmatchedPayment = await prisma.unmatchedPayment.findFirst({
            where: {
              id: match.paymentId,
              companyId: user.companyId,
              status: 'pending'
            },
            include: {
              sale: true
            }
          })
          
          if (!unmatchedPayment) {
            processed.push({
              paymentId: match.paymentId,
              success: false,
              error: 'Payment not found or already matched'
            })
            continue
          }
          
          // Get appointment
          const appointment = await prisma.appointment.findFirst({
            where: {
              id: match.appointmentId,
              companyId: user.companyId
            },
            include: {
              closer: {
                include: {
                  commissionRole: true
                }
              }
            }
          })
          
          if (!appointment) {
            processed.push({
              paymentId: match.paymentId,
              success: false,
              error: 'Appointment not found'
            })
            continue
          }
          
          // Update sale with appointment link
          await prisma.sale.update({
            where: { id: unmatchedPayment.saleId },
            data: {
              appointmentId: appointment.id,
              matchedBy: 'manual',
              matchConfidence: 1.0,
              manuallyMatched: true,
              matchedByUserId: user.id
            }
          })
          
          // Create commission if closer exists
          if (appointment.closer) {
            const commissionRate = appointment.closer.customCommissionRate 
              || appointment.closer.commissionRole?.defaultRate 
              || 0.10
            
            const { totalCommission, releasedCommission } = calculateCommission(
              Number(unmatchedPayment.sale.amount),
              commissionRate,
              Number(unmatchedPayment.sale.amount)
            )
            
            await prisma.commission.create({
              data: {
                amount: releasedCommission,
                totalAmount: totalCommission,
                releasedAmount: releasedCommission,
                percentage: commissionRate,
                status: 'pending',
                releaseStatus: 'released',
                companyId: user.companyId,
                saleId: unmatchedPayment.saleId,
                repId: appointment.closer.id
              }
            })
          }
          
          // Mark as matched
          await prisma.unmatchedPayment.update({
            where: { id: match.paymentId },
            data: {
              status: 'matched',
              reviewedAt: new Date(),
              reviewedByUserId: user.id
            }
          })
          
          processed.push({
            paymentId: match.paymentId,
            success: true
          })
        } catch (error: any) {
          processed.push({
            paymentId: match.paymentId,
            success: false,
            error: error.message || 'Unknown error'
          })
        }
      }
      
      const successCount = processed.filter(p => p.success).length
      const failureCount = processed.filter(p => !p.success).length
      
      return {
        success: true,
        total: body.matches.length,
        successful: successCount,
        failed: failureCount,
        results: processed
      }
    })
    
    return NextResponse.json(results)
    
  } catch (error: any) {
    console.error('Bulk match error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

