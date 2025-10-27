import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { withPrisma } from '@/lib/db'
import { calculateCommission } from '@/lib/payment-matcher'

export const dynamic = 'force-dynamic'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAdmin()
    const { id } = await params
    const { appointmentId } = await request.json()
    
    if (!appointmentId) {
      return NextResponse.json({ error: 'Appointment ID required' }, { status: 400 })
    }
    
    const result = await withPrisma(async (prisma) => {
      // Get unmatched payment
      const unmatchedPayment = await prisma.unmatchedPayment.findFirst({
        where: {
          id,
          companyId: user.companyId
        },
        include: {
          sale: true
        }
      })
      
      if (!unmatchedPayment) {
        throw new Error('Payment not found')
      }
      
      // Get appointment
      const appointment = await prisma.appointment.findFirst({
        where: {
          id: appointmentId,
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
        throw new Error('Appointment not found')
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
        where: { id },
        data: {
          status: 'matched',
          reviewedAt: new Date(),
          reviewedByUserId: user.id
        }
      })
      
      return { success: true }
    })
    
    return NextResponse.json(result)
    
  } catch (error: any) {
    console.error('Manual match error:', error)
    if (error.message === 'Payment not found' || error.message === 'Appointment not found') {
      return NextResponse.json({ error: error.message }, { status: 404 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

