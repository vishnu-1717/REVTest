import { NextResponse } from 'next/server'
import { withPrisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params
    
    const paymentLink = await withPrisma(async (prisma) => {
      const link = await prisma.paymentLink.findUnique({
        where: { token },
        include: {
          appointment: {
            include: {
              contact: true,
              closer: true,
              trafficSource: true
            }
          },
          company: {
            select: {
              name: true,
              email: true
            }
          },
          sales: {
            select: {
              id: true,
              amount: true,
              status: true,
              paidAt: true
            }
          }
        }
      })
      
      return link
    })
    
    if (!paymentLink) {
      return NextResponse.json(
        { error: 'Payment link not found' },
        { status: 404 }
      )
    }
    
    // Check if expired
    if (paymentLink.expiresAt && new Date(paymentLink.expiresAt) < new Date()) {
      return NextResponse.json(
        { error: 'This payment link has expired' },
        { status: 410 }
      )
    }
    
    // Check if already paid
    if (paymentLink.status === 'paid') {
      return NextResponse.json(
        { error: 'This payment has already been completed' },
        { status: 410 }
      )
    }
    
    return NextResponse.json(paymentLink)
    
  } catch (error: any) {
    console.error('Payment link fetch error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

