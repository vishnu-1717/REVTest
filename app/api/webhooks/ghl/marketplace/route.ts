import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { withPrisma } from '@/lib/db'
import { GHLWebhookPayload } from '@/types'
import {
  handleAppointmentCreated,
  handleAppointmentCancelled,
  handleAppointmentRescheduled,
  handleAppointmentUpdated
} from '@/lib/webhooks/handlers'

/**
 * GHL Marketplace Webhook Handler
 * Handles webhooks from GHL Marketplace app with signature verification
 * POST /api/webhooks/ghl/marketplace
 */
export async function POST(request: NextRequest) {
  let webhookEventId: string | null = null

  try {
    // Get webhook signature from headers
    const signature = request.headers.get('x-ghl-signature')
    const timestamp = request.headers.get('x-ghl-timestamp')
    
    // Get raw body for signature verification
    const rawBody = await request.text()
    
    // Verify webhook signature
    const webhookSecret = process.env.GHL_MARKETPLACE_WEBHOOK_SECRET
    if (webhookSecret && signature && timestamp) {
      const isValid = verifyWebhookSignature(rawBody, signature, timestamp, webhookSecret)
      if (!isValid) {
        console.error('[GHL Marketplace Webhook] Invalid signature')
        return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
      }
    } else {
      console.warn('[GHL Marketplace Webhook] Missing signature or secret - skipping verification')
    }

    // Parse JSON payload
    let body: GHLWebhookPayload
    try {
      body = JSON.parse(rawBody) as GHLWebhookPayload
    } catch (parseError) {
      console.error('[GHL Marketplace Webhook] JSON parse error:', parseError)
      return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 })
    }

    // Extract event type as string
    const eventType = typeof body.type === 'string' 
      ? body.type 
      : typeof (body as any).event === 'string'
      ? (body as any).event
      : 'unknown'

    console.log('[GHL Marketplace Webhook] Received webhook:', eventType)

    // Log webhook event
    const eventResult = await withPrisma(async (prisma) => {
      const event = await prisma.webhookEvent.create({
        data: {
          processor: 'ghl_marketplace',
          eventType: eventType,
          payload: body as any,
          processed: false
        }
      })
      return event.id
    })
    webhookEventId = eventResult

    // Extract company/location information from webhook
    // Marketplace webhooks may include locationId or companyId in the payload
    const locationId = (body as any).locationId || (body as any).location?.id
    const accountId = (body as any).accountId || (body as any).account?.id

    if (!locationId && !accountId) {
      console.error('[GHL Marketplace Webhook] No locationId or accountId in payload')
      await withPrisma(async (prisma) => {
        if (webhookEventId) {
          await prisma.webhookEvent.update({
            where: { id: webhookEventId },
            data: {
              processed: true,
              processedAt: new Date(),
              error: 'No locationId or accountId in payload'
            }
          })
        }
      })
      return NextResponse.json({ error: 'Missing location information' }, { status: 400 })
    }

    // Find company by locationId (GHL location ID)
    const company = await withPrisma(async (prisma) => {
      return await prisma.company.findFirst({
        where: {
          ghlLocationId: locationId || undefined
        }
      })
    })

    if (!company) {
      console.warn(`[GHL Marketplace Webhook] Company not found for locationId: ${locationId}`)
      await withPrisma(async (prisma) => {
        if (webhookEventId) {
          await prisma.webhookEvent.update({
            where: { id: webhookEventId },
            data: {
              processed: true,
              processedAt: new Date(),
              error: `Company not found for locationId: ${locationId}`
            }
          })
        }
      })
      // Return 200 to prevent GHL from retrying
      return NextResponse.json({ received: true, message: 'Company not found' })
    }

    console.log(`[GHL Marketplace Webhook] Found company: ${company.id} (${company.name})`)

    // Normalize webhook payload to match existing handler expectations
    const normalizedWebhook = normalizeMarketplaceWebhook(body, company.id)

    // Route to existing handlers
    switch (eventType.toLowerCase()) {
      case 'appointment.created':
      case 'appointmentcreate':
        await handleAppointmentCreated(normalizedWebhook, company as any)
        break

      case 'appointment.updated':
      case 'appointmentupdate':
        await handleAppointmentUpdated(normalizedWebhook, company as any)
        break

      case 'appointment.cancelled':
      case 'appointmentcancel':
      case 'appointment.canceled':
        await handleAppointmentCancelled(normalizedWebhook, company as any)
        break

      case 'appointment.rescheduled':
      case 'appointmentreschedule':
        await handleAppointmentRescheduled(normalizedWebhook, company as any)
        break

      default:
        console.log(`[GHL Marketplace Webhook] Unhandled event type: ${eventType}`)
        // Still mark as processed
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
  } catch (error: any) {
    console.error('[GHL Marketplace Webhook] Error:', error)
    
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
 * Verify GHL Marketplace webhook signature
 */
function verifyWebhookSignature(
  payload: string,
  signature: string,
  timestamp: string,
  secret: string
): boolean {
  try {
    // GHL Marketplace uses HMAC-SHA256
    const payloadToSign = `${timestamp}.${payload}`
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(payloadToSign)
      .digest('hex')

    // Compare signatures (constant-time comparison)
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    )
  } catch (error) {
    console.error('[GHL Marketplace Webhook] Signature verification error:', error)
    return false
  }
}

/**
 * Normalize marketplace webhook payload to match existing handler format
 */
function normalizeMarketplaceWebhook(
  payload: GHLWebhookPayload,
  companyId: string
): any {
  // Marketplace webhooks may have different structure
  // Normalize to match existing GHLWebhookExtended format
  
  const normalized: any = {
    ...payload,
    companyId
  }

  // Extract appointment data from various possible locations
  const appointmentData = 
    (payload as any).appointment ||
    (payload as any).data?.appointment ||
    (payload as any).triggerData?.appointment ||
    payload

  // Map common fields
  if (appointmentData) {
    normalized.appointmentId = 
      appointmentData.id ||
      appointmentData.appointmentId ||
      appointmentData.appointment_id ||
      (payload as any).appointmentId

    normalized.startTime = 
      appointmentData.startTime ||
      appointmentData.start_time ||
      appointmentData.scheduledAt ||
      appointmentData.scheduled_at

    normalized.endTime = 
      appointmentData.endTime ||
      appointmentData.end_time ||
      appointmentData.endAt ||
      appointmentData.end_at

    normalized.appointmentStatus = 
      appointmentData.status ||
      appointmentData.appointmentStatus ||
      appointmentData.appointment_status ||
      (payload as any).type

    normalized.calendarId = 
      appointmentData.calendarId ||
      appointmentData.calendar_id ||
      appointmentData.calendar?.id

    normalized.calendarName = 
      appointmentData.calendarName ||
      appointmentData.calendar_name ||
      appointmentData.calendar?.name

    normalized.assignedUserId = 
      appointmentData.assignedUserId ||
      appointmentData.assigned_user_id ||
      appointmentData.userId ||
      appointmentData.user_id

    normalized.title = 
      appointmentData.title ||
      appointmentData.name ||
      appointmentData.subject

    normalized.notes = 
      appointmentData.notes ||
      appointmentData.description ||
      appointmentData.note

    normalized.contactId = 
      appointmentData.contactId ||
      appointmentData.contact_id ||
      appointmentData.contact?.id

    normalized.customFields = 
      appointmentData.customFields ||
      appointmentData.custom_fields ||
      appointmentData.metadata
  }

  return normalized
}

