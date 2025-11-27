import { NextRequest, NextResponse } from 'next/server'
import { resolveCompanyFromSlackTeam } from '@/lib/slack-bot-company-resolver'
import { processQuery } from '@/lib/ai-query-engine'

/**
 * Slack /insights command handler
 * POST /api/slack/commands/insights
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const teamId = formData.get('team_id') as string
    const userId = formData.get('user_id') as string
    const text = formData.get('text') as string
    const responseUrl = formData.get('response_url') as string

    if (!teamId) {
      return NextResponse.json({
        response_type: 'ephemeral',
        text: 'Missing team_id'
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

    // Parse days (default 7)
    const days = text ? parseInt(text, 10) || 7 : 7
    const query = `Show me insights and KPIs for the last ${days} days`

    // Process query
    const result = await processQuery(query, company.companyId)

    // Format response
    const responseText = `📊 *Sales Insights (Last ${days} days)*\n\n${result.answer}`

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
      text: 'Generating insights...'
    })
  } catch (error: any) {
    console.error('[Slack Commands] Error:', error)
    return NextResponse.json({
      response_type: 'ephemeral',
      text: `Error: ${error.message || 'Failed to generate insights'}`
    })
  }
}

