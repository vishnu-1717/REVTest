import { NextRequest, NextResponse } from 'next/server'
import { resolveCompanyFromSlackTeam } from '@/lib/slack-bot-company-resolver'
import { processQuery } from '@/lib/ai-query-engine'
import { getSlackClient } from '@/lib/slack-client'
import crypto from 'crypto'
import { withPrisma } from '@/lib/db'

/**
 * Slack Events API Endpoint
 * Handles app mentions (@revphlo) and other events
 * POST /api/slack/events
 */
export async function POST(request: NextRequest) {
  try {
    // Get raw body for signature verification (must be before parsing)
    const rawBody = await request.text()
    const parsedBody = JSON.parse(rawBody)

    // URL Verification (for Slack app setup)
    if (parsedBody.type === 'url_verification') {
      return NextResponse.json({ challenge: parsedBody.challenge })
    }

    // Verify signature
    const signature = request.headers.get('x-slack-signature')
    const timestamp = request.headers.get('x-slack-request-timestamp')
    
    if (!signature || !timestamp) {
      return NextResponse.json({ error: 'Missing signature' }, { status: 401 })
    }

    // Resolve company from team_id
    const teamId = parsedBody.team_id || parsedBody.event?.team
    if (!teamId) {
      return NextResponse.json({ error: 'Missing team_id' }, { status: 400 })
    }

    const company = await resolveCompanyFromSlackTeam(teamId)
    if (!company) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 })
    }

    // Verify signature if signing secret is available
    if (company.slackSigningSecret) {
      const isValid = verifySlackSignature(
        rawBody,
        signature,
        timestamp,
        company.slackSigningSecret
      )

      if (!isValid) {
        return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
      }
    } else {
      // Warn but don't block if signing secret is not set (for development)
      console.warn('[Slack Events] No signing secret configured for company:', company.companyId)
    }

    // Handle event
    if (parsedBody.type === 'event_callback') {
      const event = parsedBody.event

      // Handle app mentions (@revphlo)
      if (event.type === 'app_mention') {
        // Acknowledge immediately (Slack requires response within 3 seconds)
        const acknowledgeResponse = NextResponse.json({ ok: true })
        
        // Process mention asynchronously
        processAppMention(event, company.companyId).catch(err => {
          console.error('[Slack Events] Error processing app mention:', err)
        })

        return acknowledgeResponse
      }
    }

    // Return 200 for other events (we don't handle them)
    return NextResponse.json({ ok: true })
  } catch (error: any) {
    console.error('[Slack Events] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * Process app mention event
 */
async function processAppMention(event: any, companyId: string) {
  try {
    const { text, channel, user, ts } = event

    // Remove bot mention from text
    // Text format: "<@U123456> what's my close rate?"
    const queryText = text
      .replace(/<@[A-Z0-9]+>/g, '') // Remove mention
      .trim()

    if (!queryText) {
      // No query provided, send help message
      await sendSlackMessage(companyId, channel, {
        text: "Hi! I'm Revphlo's AI assistant. Ask me questions about your sales data!\n\nExamples:\n• What's my close rate this month?\n• Show me insights for the last 7 days\n• How many appointments did I have last week?",
        thread_ts: ts // Reply in thread
      })
      return
    }

    // Process query
    const result = await processQuery(queryText, companyId)

    // Format response
    let responseText = result.answer

    if (result.sources && result.sources.length > 0) {
      responseText += `\n\n*Sources:* ${result.sources.length} relevant calls found`
    }

    // Send response in thread
    await sendSlackMessage(companyId, channel, {
      text: responseText,
      thread_ts: ts // Reply in thread to keep conversation organized
    })
  } catch (error: any) {
    console.error('[Slack Events] Error processing mention:', error)
    
    // Send error message to user
    try {
      await sendSlackMessage(companyId, event.channel, {
        text: `Sorry, I encountered an error: ${error.message || 'Failed to process your query'}`,
        thread_ts: event.ts
      })
    } catch (sendError) {
      console.error('[Slack Events] Error sending error message:', sendError)
    }
  }
}

/**
 * Send Slack message
 */
async function sendSlackMessage(companyId: string, channel: string, message: any) {
  const slackClient = await getSlackClient(companyId)
  if (!slackClient) {
    throw new Error('Slack client not available')
  }

  await slackClient.chat.postMessage({
    channel,
    ...message
  })
}

/**
 * Verify Slack request signature
 */
function verifySlackSignature(
  body: string,
  signature: string,
  timestamp: string,
  signingSecret: string
): boolean {
  // Check timestamp (prevent replay attacks)
  const currentTime = Math.floor(Date.now() / 1000)
  const requestTime = parseInt(timestamp, 10)
  
  if (Math.abs(currentTime - requestTime) > 300) {
    // Request is older than 5 minutes
    return false
  }

  // Create signature base string
  const sigBaseString = `v0:${timestamp}:${body}`

  // Create expected signature
  const hmac = crypto.createHmac('sha256', signingSecret)
  hmac.update(sigBaseString)
  const expectedSignature = `v0=${hmac.digest('hex')}`

  // Compare signatures (constant-time comparison)
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  )
}

