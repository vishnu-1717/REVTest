import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { getEffectiveCompanyId } from '@/lib/company-context'
import { withPrisma } from '@/lib/db'

export async function POST(request: NextRequest) {
  try {
    await requireAdmin()
    
    const companyId = await getEffectiveCompanyId(request.url)
    
    await withPrisma(async (prisma) => {
      // Clear all Slack fields
      await prisma.company.update({
        where: { id: companyId },
        data: {
          slackWorkspaceId: null,
          slackWorkspaceName: null,
          slackBotToken: null,
          slackAppId: null,
          slackClientId: null,
          slackClientSecret: null,
          slackSigningSecret: null,
          slackConnectedAt: null,
          slackChannelId: null,
        },
      })
      
      // Optionally clear user Slack mappings (or keep them for reconnection)
      // For now, we'll keep them so reconnection is easier
    })
    
    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('[Slack Disconnect] Error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

