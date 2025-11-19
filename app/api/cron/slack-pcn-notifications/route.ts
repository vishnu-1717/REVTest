import { NextRequest, NextResponse } from 'next/server'
import { checkAndNotifyPendingPCNs } from '@/lib/jobs/slack-pcn-notifications'
import { headers } from 'next/headers'

/**
 * Cron job endpoint for checking and sending Slack PCN notifications
 * Should be called every 5-10 minutes
 * 
 * Secured by Vercel Cron secret (set in Vercel dashboard)
 */
export async function GET(request: NextRequest) {
  try {
    // Vercel Cron jobs are automatically secured by Vercel's infrastructure
    // Optional: Add additional security with CRON_SECRET if needed
    const headersList = await headers()
    const authHeader = headersList.get('authorization')
    const cronSecret = process.env.CRON_SECRET

    // If CRON_SECRET is set, verify the Authorization header
    // If not set, allow the request (Vercel cron is already secured)
    if (cronSecret) {
      if (authHeader !== `Bearer ${cronSecret}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
    }

    const stats = await checkAndNotifyPendingPCNs()

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      stats,
    })
  } catch (error: any) {
    console.error('[Cron] Error in Slack PCN notifications:', error)
    return NextResponse.json(
      { error: error.message, timestamp: new Date().toISOString() },
      { status: 500 }
    )
  }
}

