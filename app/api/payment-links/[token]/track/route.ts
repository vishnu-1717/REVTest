import { NextResponse } from 'next/server'
import { withPrisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params
    
    const result = await withPrisma(async (prisma) => {
      // Track that the payment link was opened
      const paymentLink = await prisma.paymentLink.update({
        where: { token },
        data: {
          opens: { increment: 1 },
          lastOpenedAt: new Date()
        }
      })
      
      return { success: true }
    })
    
    return NextResponse.json(result)
    
  } catch (error: any) {
    console.error('Payment link tracking error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

