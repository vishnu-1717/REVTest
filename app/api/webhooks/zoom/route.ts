import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { withPrisma } from '@/lib/db'
import { analyzeZoomRecording } from '@/lib/zoom-transcript-analyzer'
import { updateShowRateFromZoom } from '@/lib/zoom-show-rate'

/**
 * Zoom Webhook Handler
 * Handles recording.completed events and triggers transcript analysis
 * POST /api/webhooks/zoom
 */
export async function POST(request: NextRequest) {
  let webhookEventId: string | null = null

  try {
    // Get webhook signature from headers
    const signature = request.headers.get('x-zm-signature')
    const timestamp = request.headers.get('x-zm-request-timestamp')
    
    // Get raw body for signature verification
    const rawBody = await request.text()
    
    // Verify webhook signature
    const webhookSecret = process.env.ZOOM_WEBHOOK_SECRET
    if (webhookSecret && signature && timestamp) {
      const isValid = verifyWebhookSignature(rawBody, signature, timestamp, webhookSecret)
      if (!isValid) {
        console.error('[Zoom Webhook] Invalid signature')
        return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
      }
    } else {
      console.warn('[Zoom Webhook] Missing signature or secret - skipping verification')
    }

    // Parse JSON payload
    let body: any
    try {
      body = JSON.parse(rawBody)
    } catch (parseError) {
      console.error('[Zoom Webhook] JSON parse error:', parseError)
      return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 })
    }

    console.log('[Zoom Webhook] Received event:', body.event)

    // Log webhook event
    const eventResult = await withPrisma(async (prisma) => {
      const event = await prisma.webhookEvent.create({
        data: {
          processor: 'zoom',
          eventType: body.event || 'unknown',
          payload: body as any,
          processed: false
        }
      })
      return event.id
    })
    webhookEventId = eventResult

    // Handle recording.completed event
    if (body.event === 'recording.completed') {
      const payload = body.payload || {}
      const accountId = payload.account_id
      const object = payload.object || {}

      if (!accountId) {
        console.error('[Zoom Webhook] No account_id in payload')
        await withPrisma(async (prisma) => {
          if (webhookEventId) {
            await prisma.webhookEvent.update({
              where: { id: webhookEventId },
              data: {
                processed: true,
                processedAt: new Date(),
                error: 'No account_id in payload'
              }
            })
          }
        })
        return NextResponse.json({ error: 'Missing account_id' }, { status: 400 })
      }

      // Find company by Zoom account ID
      const company = await withPrisma(async (prisma) => {
        return await prisma.company.findFirst({
          where: {
            zoomAccountId: accountId
          }
        })
      })

      if (!company) {
        console.warn(`[Zoom Webhook] Company not found for accountId: ${accountId}`)
        await withPrisma(async (prisma) => {
          if (webhookEventId) {
            await prisma.webhookEvent.update({
              where: { id: webhookEventId },
              data: {
                processed: true,
                processedAt: new Date(),
                error: `Company not found for accountId: ${accountId}`
              }
            })
          }
        })
        // Return 200 to prevent Zoom from retrying
        return NextResponse.json({ received: true, message: 'Company not found' })
      }

      console.log(`[Zoom Webhook] Found company: ${company.id} (${company.name})`)

      // Extract meeting information
      const meeting = object.meeting || {}
      const meetingId = meeting.id || meeting.meeting_id
      const recordingFiles = object.recording_files || []

      if (!meetingId) {
        console.error('[Zoom Webhook] No meeting ID in payload')
        await withPrisma(async (prisma) => {
          if (webhookEventId) {
            await prisma.webhookEvent.update({
              where: { id: webhookEventId },
              data: {
                processed: true,
                processedAt: new Date(),
                error: 'No meeting ID in payload'
              }
            })
          }
        })
        return NextResponse.json({ error: 'Missing meeting ID' }, { status: 400 })
      }

      // Update show rate first (based on meeting duration/participants)
      try {
        await updateShowRateFromZoom(meetingId, company.id)
      } catch (error) {
        console.error('[Zoom Webhook] Error updating show rate:', error)
        // Continue even if show rate update fails
      }

      // Check if transcript is available
      const transcriptFile = recordingFiles.find((file: any) => 
        file.file_type === 'TRANSCRIPT' || file.file_extension === 'vtt'
      )

      if (transcriptFile) {
        // Analyze transcript and generate PCN
        try {
          const result = await analyzeZoomRecording(meetingId, company.id)
          
          if (result.success) {
            console.log(`[Zoom Webhook] Successfully analyzed transcript for meeting ${meetingId}`)
            if (result.pcnSubmitted) {
              console.log(`[Zoom Webhook] PCN auto-submitted for appointment ${result.appointmentId}`)
            } else {
              console.log(`[Zoom Webhook] PCN generated and stored for review (appointment ${result.appointmentId})`)
            }
          } else {
            console.error(`[Zoom Webhook] Failed to analyze transcript: ${result.error}`)
          }
        } catch (error: any) {
          console.error('[Zoom Webhook] Error analyzing transcript:', error)
          // Continue even if analysis fails
        }
      } else {
        console.log(`[Zoom Webhook] No transcript file found for meeting ${meetingId}`)
      }

      // Mark webhook event as processed
      await withPrisma(async (prisma) => {
        if (webhookEventId) {
          await prisma.webhookEvent.update({
            where: { id: webhookEventId },
            data: {
              processed: true,
              processedAt: new Date(),
              companyId: company.id
            }
          })
        }
      })

      return NextResponse.json({ received: true })
    } else {
      // Other event types - just log and acknowledge
      console.log(`[Zoom Webhook] Unhandled event type: ${body.event}`)
      
      await withPrisma(async (prisma) => {
        if (webhookEventId) {
          await prisma.webhookEvent.update({
            where: { id: webhookEventId },
            data: {
              processed: true,
              processedAt: new Date()
            }
          })
        }
      })

      return NextResponse.json({ received: true })
    }
  } catch (error: any) {
    console.error('[Zoom Webhook] Error:', error)
    
    // Mark webhook event as processed with error
    if (webhookEventId) {
      await withPrisma(async (prisma) => {
        await prisma.webhookEvent.update({
          where: { id: webhookEventId },
          data: {
            processed: true,
            processedAt: new Date(),
            error: error.message || 'Unknown error'
          }
        })
      })
    }

    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * Verify Zoom webhook signature
 * Zoom uses HMAC-SHA256 with timestamp + request body
 */
function verifyWebhookSignature(
  payload: string,
  signature: string,
  timestamp: string,
  secret: string
): boolean {
  try {
    // Zoom signature format: HMAC-SHA256(timestamp + request body)
    const payloadToSign = `v0:${timestamp}:${payload}`
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(payloadToSign)
      .digest('hex')

    const fullExpectedSignature = `v0=${expectedSignature}`

    // Compare signatures (constant-time comparison)
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(fullExpectedSignature)
    )
  } catch (error) {
    console.error('[Zoom Webhook] Signature verification error:', error)
    return false
  }
}

