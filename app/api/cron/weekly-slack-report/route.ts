import { NextRequest, NextResponse } from 'next/server'
import { sendWeeklyReportsToAllCompanies } from '@/lib/slack-weekly-report'

/**
 * Weekly Slack Report Cron Job
 * Can be called by Vercel Cron or external cron service
 * GET /api/cron/weekly-slack-report
 */
export async function GET(request: NextRequest) {
  try {
    // Verify cron secret (optional, for security)
    const authHeader = request.headers.get('authorization')
    const cronSecret = process.env.CRON_SECRET

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const result = await sendWeeklyReportsToAllCompanies()

    return NextResponse.json({
      success: true,
      sent: result.sent,
      failed: result.failed
    })
  } catch (error: any) {
    console.error('[Cron] Error sending weekly reports:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to send weekly reports' },
      { status: 500 }
    )
  }
}

