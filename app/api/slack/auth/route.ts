import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { getEffectiveCompanyId } from '@/lib/company-context'
import { cookies } from 'next/headers'
import crypto from 'crypto'

export async function GET(request: NextRequest) {
  try {
    // Require admin authentication
    await requireAdmin()
    
    // Get the company ID for this request
    const companyId = await getEffectiveCompanyId(request.url)
    
    if (!companyId) {
      return NextResponse.json({ error: 'Company not found' }, { status: 400 })
    }
    
    // Get Slack credentials from environment
    const clientId = process.env.SLACK_CLIENT_ID
    if (!clientId) {
      return NextResponse.json({ error: 'Slack client ID not configured' }, { status: 500 })
    }
    
    // Generate state for CSRF protection
    const state = crypto.randomBytes(32).toString('hex')
    
    // Store state and company ID in cookie
    const cookieStore = await cookies()
    cookieStore.set('slack_oauth_state', state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 600 // 10 minutes
    })
    cookieStore.set('slack_oauth_company_id', companyId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 600 // 10 minutes
    })
    
    // Build Slack OAuth URL
    const redirectUri = encodeURIComponent('https://app.revphlo.com/api/slack/callback')
    const scopes = encodeURIComponent('chat:write users:read channels:read groups:read')
    const slackAuthUrl = `https://slack.com/oauth/v2/authorize?client_id=${clientId}&scope=${scopes}&redirect_uri=${redirectUri}&state=${state}`
    
    // Redirect to Slack
    return NextResponse.redirect(slackAuthUrl)
  } catch (error: any) {
    console.error('[Slack OAuth] Error initiating OAuth:', error)
    return NextResponse.json({ error: 'Failed to initiate Slack OAuth' }, { status: 500 })
  }
}

