import { NextRequest, NextResponse } from 'next/server'
import { withPrisma } from '@/lib/db'
import { getSlackClient } from '@/lib/slack-client'
import { extractPCNDataFromAppointment } from '@/lib/pcn-changelog'
import crypto from 'crypto'

/**
 * Slack Interactions Endpoint
 * Handles button clicks, modal submissions, etc.
 * POST /api/slack/interactions
 */
export async function POST(request: NextRequest) {
  try {
    // Get raw body for signature verification
    const rawBody = await request.text()
    const body = JSON.parse(rawBody)

    // Verify Slack signature
    const signature = request.headers.get('x-slack-signature')
    const timestamp = request.headers.get('x-slack-request-timestamp')
    
    if (signature && timestamp) {
      // Find company by team_id
      const teamId = body.team?.id || body.team_id
      if (!teamId) {
        return NextResponse.json({ error: 'Missing team_id' }, { status: 400 })
      }

      const company = await withPrisma(async (prisma) => {
        return await prisma.company.findFirst({
          where: { slackWorkspaceId: teamId },
          select: {
            id: true,
            slackSigningSecret: true
          }
        })
      })

      if (!company) {
        return NextResponse.json({ error: 'Company not found' }, { status: 404 })
      }

      // Verify signature
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
      }
    }

    // Handle different interaction types
    if (body.type === 'block_actions') {
      return await handleBlockActions(body)
    } else if (body.type === 'view_submission') {
      return await handleViewSubmission(body)
    } else if (body.type === 'shortcut' || body.type === 'message_action') {
      // Handle shortcuts if needed
      return NextResponse.json({ response_type: 'ephemeral', text: 'Not implemented' })
    }

    // Acknowledge other interaction types
    return NextResponse.json({ ok: true })
  } catch (error: any) {
    console.error('[Slack Interactions] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * Handle block actions (button clicks)
 */
async function handleBlockActions(payload: any): Promise<NextResponse> {
  const action = payload.actions?.[0]
  if (!action) {
    return NextResponse.json({ ok: true })
  }

  const teamId = payload.team?.id || payload.team_id
  const appointmentId = action.value

  // Find company
  const company = await withPrisma(async (prisma) => {
    return await prisma.company.findFirst({
      where: { slackWorkspaceId: teamId },
      select: { id: true }
    })
  })

  if (!company) {
    return NextResponse.json({ error: 'Company not found' }, { status: 404 })
  }

  // Get appointment and AI-generated PCN data
  const appointment = await withPrisma(async (prisma) => {
    return await prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: {
        contact: true,
        closer: true
      }
    })
  })

  if (!appointment) {
    return NextResponse.json({ error: 'Appointment not found' }, { status: 404 })
  }

  // Get AI-generated PCN from customFields
  const customFields = appointment.customFields as any
  const aiGeneratedPCN = customFields?.aiGeneratedPCN

  if (action.action_id === 'pcn_review_edit') {
    // Open modal for review/edit
    const modal = buildPCNReviewModal(appointmentId, aiGeneratedPCN, appointment)
    
    const client = await getSlackClient(company.id)
    if (!client) {
      return NextResponse.json({ error: 'Slack client not available' }, { status: 500 })
    }

    try {
      await client.views.open({
        trigger_id: payload.trigger_id,
        view: modal
      })
    } catch (error: any) {
      console.error('[Slack Interactions] Error opening modal:', error)
      return NextResponse.json({ error: 'Failed to open modal' }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } else if (action.action_id === 'pcn_approve_submit') {
    // Approve and submit PCN
    if (!aiGeneratedPCN) {
      return NextResponse.json({ error: 'No AI-generated PCN found' }, { status: 400 })
    }

    // Import submitPCN function
    const { submitPCN } = await import('@/lib/pcn-submission')
    const { logPCNReview, logPCNCreation } = await import('@/lib/pcn-changelog')

    try {
      // Submit PCN
      await submitPCN({
        appointmentId,
        companyId: company.id,
        submission: aiGeneratedPCN,
        actorUserId: null, // Will be set from Slack user
        actorName: payload.user?.name || 'Slack User',
        strictValidation: false
      })

      // Log approval
      await logPCNReview(
        appointmentId,
        company.id,
        'approved',
        payload.user?.id || '',
        payload.user?.name || 'Slack User',
        'Approved and submitted via Slack'
      )

      // Update message to show approved
      const client = await getSlackClient(company.id)
      if (client && payload.response_url) {
        await fetch(payload.response_url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            replace_original: true,
            text: `✅ PCN approved and submitted by ${payload.user?.name || 'user'}`
          })
        })
      }

      return NextResponse.json({ ok: true })
    } catch (error: any) {
      console.error('[Slack Interactions] Error submitting PCN:', error)
      return NextResponse.json(
        { error: `Failed to submit PCN: ${error.message}` },
        { status: 500 }
      )
    }
  }

  return NextResponse.json({ ok: true })
}

/**
 * Handle view submission (modal form submission)
 */
async function handleViewSubmission(payload: any): Promise<NextResponse> {
  const view = payload.view
  const callbackId = view.callback_id
  const values = view.state.values

  if (callbackId === 'pcn_review_modal') {
    const appointmentId = view.private_metadata
    const teamId = payload.team.id

    // Find company
    const company = await withPrisma(async (prisma) => {
      return await prisma.company.findFirst({
        where: { slackWorkspaceId: teamId },
        select: { id: true }
      })
    })

    if (!company) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 })
    }

    // Extract PCN data from form
    const pcnData = extractPCNFromModal(values)

    // Get previous PCN data
    const appointment = await withPrisma(async (prisma) => {
      return await prisma.appointment.findUnique({
        where: { id: appointmentId }
      })
    })

    if (!appointment) {
      return NextResponse.json({ error: 'Appointment not found' }, { status: 404 })
    }

    const previousData = extractPCNDataFromAppointment(appointment)

    // Submit updated PCN
    const { submitPCN } = await import('@/lib/pcn-submission')
    const { logPCNUpdate, logPCNReview } = await import('@/lib/pcn-changelog')

    try {
      await submitPCN({
        appointmentId,
        companyId: company.id,
        submission: pcnData,
        actorUserId: null,
        actorName: payload.user?.name || 'Slack User',
        strictValidation: false
      })

      // Log update
      await logPCNUpdate(
        appointmentId,
        company.id,
        previousData,
        pcnData,
        null,
        payload.user?.name || 'Slack User',
        'slack'
      )

      // Log review
      await logPCNReview(
        appointmentId,
        company.id,
        'reviewed',
        payload.user?.id || '',
        payload.user?.name || 'Slack User',
        'Reviewed and edited via Slack'
      )

      return NextResponse.json({
        response_action: 'update',
        view: {
          type: 'modal',
          title: {
            type: 'plain_text',
            text: 'PCN Submitted'
          },
          blocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: '✅ PCN has been reviewed, edited, and submitted successfully!'
              }
            }
          ]
        }
      })
    } catch (error: any) {
      console.error('[Slack Interactions] Error submitting PCN:', error)
      return NextResponse.json({
        response_action: 'errors',
        errors: {
          'pcn_submit': error.message || 'Failed to submit PCN'
        }
      })
    }
  }

  return NextResponse.json({ ok: true })
}

/**
 * Build PCN review modal
 */
function buildPCNReviewModal(appointmentId: string, pcnData: any, appointment: any): any {
  return {
    type: 'modal',
    callback_id: 'pcn_review_modal',
    private_metadata: appointmentId,
    title: {
      type: 'plain_text',
      text: 'Review & Edit PCN'
    },
    submit: {
      type: 'plain_text',
      text: 'Submit PCN'
    },
    close: {
      type: 'plain_text',
      text: 'Cancel'
    },
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Prospect:* ${appointment.contact.name}\n*Appointment ID:* ${appointmentId}`
        }
      },
      {
        type: 'divider'
      },
      {
        type: 'input',
        block_id: 'call_outcome',
        label: {
          type: 'plain_text',
          text: 'Call Outcome'
        },
        element: {
          type: 'static_select',
          action_id: 'call_outcome',
          initial_option: pcnData?.callOutcome ? {
            text: { type: 'plain_text', text: pcnData.callOutcome },
            value: pcnData.callOutcome
          } : undefined,
          options: [
            { text: { type: 'plain_text', text: 'Showed' }, value: 'showed' },
            { text: { type: 'plain_text', text: 'Signed' }, value: 'signed' },
            { text: { type: 'plain_text', text: 'No Show' }, value: 'no_show' },
            { text: { type: 'plain_text', text: 'Cancelled' }, value: 'cancelled' },
            { text: { type: 'plain_text', text: 'Contract Sent' }, value: 'contract_sent' }
          ]
        }
      },
      {
        type: 'input',
        block_id: 'notes',
        label: {
          type: 'plain_text',
          text: 'Notes'
        },
        element: {
          type: 'plain_text_input',
          action_id: 'notes',
          multiline: true,
          initial_value: pcnData?.notes || '',
          placeholder: {
            type: 'plain_text',
            text: 'Enter call notes...'
          }
        },
        optional: true
      }
    ]
  }
}

/**
 * Extract PCN data from modal form values
 */
function extractPCNFromModal(values: any): any {
  const pcn: any = {}

  if (values.call_outcome?.call_outcome?.selected_option?.value) {
    pcn.callOutcome = values.call_outcome.call_outcome.selected_option.value
  }

  if (values.notes?.notes?.value) {
    pcn.notes = values.notes.notes.value
  }

  // Add more fields as needed based on call outcome

  return pcn
}

/**
 * Verify Slack request signature
 */
function verifySlackSignature(
  body: string,
  signature: string,
  timestamp: string,
  secret: string
): boolean {
  try {
    const sigBaseString = `v0:${timestamp}:${body}`
    const mySignature = 'v0=' + crypto
      .createHmac('sha256', secret)
      .update(sigBaseString)
      .digest('hex')

    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(mySignature)
    )
  } catch (error) {
    console.error('[Slack Interactions] Signature verification error:', error)
    return false
  }
}

