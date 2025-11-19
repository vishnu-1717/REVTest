import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { getEffectiveCompanyId } from '@/lib/company-context'
import { withPrisma } from '@/lib/db'

export async function GET(request: NextRequest) {
  try {
    await requireAdmin()
    
    const companyId = await getEffectiveCompanyId(request.url)
    
    const company = await withPrisma(async (prisma) => {
      return await prisma.company.findUnique({
        where: { id: companyId },
        select: {
          slackConnectedAt: true,
          slackWorkspaceName: true,
        },
      })
    })
    
    return NextResponse.json({
      connected: !!company?.slackConnectedAt,
      workspaceName: company?.slackWorkspaceName || null,
    })
  } catch (error: any) {
    console.error('[Slack Status] Error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

