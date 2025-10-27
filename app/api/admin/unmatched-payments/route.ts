import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { withPrisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const user = await requireAdmin()
    
    const unmatchedPayments = await withPrisma(async (prisma) => {
      return await prisma.unmatchedPayment.findMany({
        where: {
          companyId: user.companyId,
          status: 'pending'
        },
        include: {
          sale: true
        },
        orderBy: {
          createdAt: 'desc'
        }
      })
    })
    
    return NextResponse.json(unmatchedPayments)
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 401 })
  }
}

