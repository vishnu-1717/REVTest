import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { withPrisma } from '@/lib/db'
import { cookies } from 'next/headers'
import { WebClient } from '@slack/web-api'

export async function GET(request: NextRequest) {
  try {
    // Verify user is authenticated and is admin
    const user = await requireAdmin()
    
    const searchParams = request.nextUrl.searchParams
    const code = searchParams.get('code')
    const state = searchParams.get('state')
    const error = searchParams.get('error')
    
    // Check for OAuth errors
    if (error) {
      console.error('[Slack OAuth] OAuth error:', error)
      return NextResponse.redirect(
        new URL('/admin/integrations/slack/setup?error=oauth_cancelled', request.url)
      )
    }
    
    if (!code || !state) {
      return NextResponse.redirect(
        new URL('/admin/integrations/slack/setup?error=missing_params', request.url)
      )
    }
    
    // Verify state (CSRF protection)
    const cookieStore = await cookies()
    const storedState = cookieStore.get('slack_oauth_state')?.value
    const companyId = cookieStore.get('slack_oauth_company_id')?.value
    
    if (!storedState || storedState !== state) {
      console.error('[Slack OAuth] State mismatch')
      return NextResponse.redirect(
        new URL('/admin/integrations/slack/setup?error=invalid_state', request.url)
      )
    }
    
    if (!companyId) {
      return NextResponse.redirect(
        new URL('/admin/integrations/slack/setup?error=missing_company', request.url)
      )
    }
    
    // Verify user has permission to connect Slack for this company
    if (user.companyId !== companyId && !user.superAdmin) {
      console.error('[Slack OAuth] User does not have permission for this company')
      return NextResponse.redirect(
        new URL('/admin/integrations/slack/setup?error=unauthorized', request.url)
      )
    }
    
    // Clear state cookies
    cookieStore.set('slack_oauth_state', '', { maxAge: 0, path: '/' })
    cookieStore.set('slack_oauth_company_id', '', { maxAge: 0, path: '/' })
    
    // Get Slack credentials
    const clientId = process.env.SLACK_CLIENT_ID
    const clientSecret = process.env.SLACK_CLIENT_SECRET
    
    if (!clientId || !clientSecret) {
      console.error('[Slack OAuth] Missing Slack credentials')
      return NextResponse.redirect(
        new URL('/admin/integrations/slack/setup?error=config_error', request.url)
      )
    }
    
    // Exchange code for access token
    const redirectUri = 'https://app.revphlo.com/api/slack/callback'
    const tokenResponse = await fetch('https://slack.com/api/oauth.v2.access', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code: code,
        redirect_uri: redirectUri,
      }),
    })
    
    const tokenData = await tokenResponse.json()
    
    if (!tokenData.ok) {
      console.error('[Slack OAuth] Token exchange failed:', tokenData.error)
      return NextResponse.redirect(
        new URL(`/admin/integrations/slack/setup?error=${encodeURIComponent(tokenData.error || 'token_exchange_failed')}`, request.url)
      )
    }
    
    // Extract workspace and bot info
    const workspaceId = tokenData.team?.id
    const workspaceName = tokenData.team?.name
    const botToken = tokenData.access_token // This is the bot token (xoxb-...)
    const appId = tokenData.app_id
    
    // For workspace tokens (xapp), we need to get the bot token differently
    // The access_token might be a workspace token, so we need to use it to get bot info
    let finalBotToken = botToken
    
    // If we have a bot token, verify it works and get workspace info
    if (botToken) {
      try {
        const slackClient = new WebClient(botToken)
        const authTest = await slackClient.auth.test()
        
        if (authTest.ok) {
          // Use the bot token from auth.test if available
          finalBotToken = botToken
        }
      } catch (err) {
        console.error('[Slack OAuth] Error testing bot token:', err)
      }
    }
    
    // Store credentials in database
    await withPrisma(async (prisma) => {
      await prisma.company.update({
        where: { id: companyId },
        data: {
          slackWorkspaceId: workspaceId || null,
          slackWorkspaceName: workspaceName || null,
          slackBotToken: finalBotToken || null,
          slackAppId: appId || null,
          slackClientId: clientId,
          slackConnectedAt: new Date(),
        },
      })
    })
    
    // Redirect to success page
    return NextResponse.redirect(
      new URL('/admin/integrations/slack/setup?success=true', request.url)
    )
  } catch (error: any) {
    console.error('[Slack OAuth] Error in callback:', error)
    return NextResponse.redirect(
      new URL(`/admin/integrations/slack/setup?error=${encodeURIComponent(error.message || 'unknown_error')}`, request.url)
    )
  }
}

