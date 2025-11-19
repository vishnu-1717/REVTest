import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { checkAndNotifyPendingPCNs } from '@/lib/jobs/slack-pcn-notifications'

export async function POST(request: NextRequest) {
  try {
    await requireAdmin()
    
    const stats = await checkAndNotifyPendingPCNs()
    
    return NextResponse.json({
      success: true,
      stats,
    })
  } catch (error: any) {
    console.error('[Slack Notify Pending] Error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

