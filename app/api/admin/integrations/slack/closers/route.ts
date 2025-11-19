import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { getEffectiveCompanyId } from '@/lib/company-context'
import { withPrisma } from '@/lib/db'

export async function GET(request: NextRequest) {
  try {
    await requireAdmin()
    
    const companyId = await getEffectiveCompanyId(request.url)
    
    const closers = await withPrisma(async (prisma) => {
      return await prisma.user.findMany({
        where: {
          companyId,
          isActive: true,
          role: { in: ['closer', 'rep', 'admin'] }, // Include admins who might also be closers
        },
        select: {
          id: true,
          name: true,
          email: true,
          slackUserId: true,
          slackUserName: true,
        },
        orderBy: {
          name: 'asc',
        },
      })
    })
    
    return NextResponse.json({ closers })
  } catch (error: any) {
    console.error('[Slack Closers] Error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

