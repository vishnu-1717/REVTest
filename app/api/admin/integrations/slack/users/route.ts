import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { getEffectiveCompanyId } from '@/lib/company-context'
import { getSlackUsers } from '@/lib/slack-client'

export async function GET(request: NextRequest) {
  try {
    await requireAdmin()
    
    const companyId = await getEffectiveCompanyId(request.url)
    
    const users = await getSlackUsers(companyId)
    
    return NextResponse.json({ users })
  } catch (error: any) {
    console.error('[Slack Users] Error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

