import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { getEffectiveCompanyId } from '@/lib/company-context'
import { withPrisma } from '@/lib/db'
import { getSlackChannels } from '@/lib/slack-client'

export async function PATCH(request: NextRequest) {
  try {
    await requireAdmin()
    
    const companyId = await getEffectiveCompanyId(request.url)
    const body = await request.json()
    const { channelId } = body
    
    // If channelId is provided, validate it exists in the workspace
    if (channelId) {
      const channels = await getSlackChannels(companyId)
      const channelExists = channels.some((ch) => ch.id === channelId)
      
      if (!channelExists) {
        return NextResponse.json(
          { error: 'Channel not found in workspace' },
          { status: 400 }
        )
      }
    }
    
    // Update company's default channel
    await withPrisma(async (prisma) => {
      await prisma.company.update({
        where: { id: companyId },
        data: {
          slackChannelId: channelId || null,
        },
      })
    })
    
    return NextResponse.json({ success: true, channelId: channelId || null })
  } catch (error: any) {
    console.error('[Slack Channel Update] Error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  try {
    await requireAdmin()
    
    const companyId = await getEffectiveCompanyId(request.url)
    
    const company = await withPrisma(async (prisma) => {
      return await prisma.company.findUnique({
        where: { id: companyId },
        select: {
          slackChannelId: true,
        },
      })
    })
    
    return NextResponse.json({
      channelId: company?.slackChannelId || null,
    })
  } catch (error: any) {
    console.error('[Slack Channel] Error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

