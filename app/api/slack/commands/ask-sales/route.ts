import { NextRequest, NextResponse } from 'next/server'
import { resolveCompanyFromSlackTeam } from '@/lib/slack-bot-company-resolver'
import { processQuery } from '@/lib/ai-query-engine'
import crypto from 'crypto'

/**
 * Slack /ask-sales command handler
 * POST /api/slack/commands/ask-sales
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const teamId = formData.get('team_id') as string
    const userId = formData.get('user_id') as string
    const text = formData.get('text') as string
    const responseUrl = formData.get('response_url') as string

    if (!teamId || !text) {
      return NextResponse.json({
        response_type: 'ephemeral',
        text: 'Missing required parameters'
      })
    }

    // Resolve company from team_id
    const company = await resolveCompanyFromSlackTeam(teamId)
    if (!company) {
      return NextResponse.json({
        response_type: 'ephemeral',
        text: 'Slack workspace not connected. Please contact your admin to connect Slack.'
      })
    }

    // Process query
    const result = await processQuery(text, company.companyId)

    // Format response
    let responseText = result.answer

    if (result.sources && result.sources.length > 0) {
      responseText += `\n\n*Sources:* ${result.sources.length} relevant calls found`
    }

    // Send response (async, don't wait)
    if (responseUrl) {
      fetch(responseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          response_type: 'in_channel',
          text: responseText,
          blocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: responseText
              }
            }
          ]
        })
      }).catch(err => console.error('[Slack Commands] Error sending response:', err))
    }

    // Return immediate acknowledgment
    return NextResponse.json({
      response_type: 'ephemeral',
      text: 'Processing your query...'
    })
  } catch (error: any) {
    console.error('[Slack Commands] Error:', error)
    return NextResponse.json({
      response_type: 'ephemeral',
      text: `Error: ${error.message || 'Failed to process query'}`
    })
  }
}

