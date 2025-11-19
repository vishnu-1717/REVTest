import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { getEffectiveCompanyId } from '@/lib/company-context'
import { getSlackChannels } from '@/lib/slack-client'

export async function GET(request: NextRequest) {
  try {
    await requireAdmin()
    
    const companyId = await getEffectiveCompanyId(request.url)
    
    const channels = await getSlackChannels(companyId)
    
    return NextResponse.json({ channels })
  } catch (error: any) {
    console.error('[Slack Channels] Error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

