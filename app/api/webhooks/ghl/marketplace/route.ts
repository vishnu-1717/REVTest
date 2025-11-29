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
    // Log incoming request for debugging
    console.log('[GHL Marketplace Webhook] ===== INCOMING WEBHOOK =====')
    console.log('[GHL Marketplace Webhook] URL:', request.url)
    console.log('[GHL Marketplace Webhook] Method:', request.method)
    
    // Get webhook signature from headers
    const signature = request.headers.get('x-ghl-signature')
    const timestamp = request.headers.get('x-ghl-timestamp')
    
    console.log('[GHL Marketplace Webhook] Headers:')
    console.log('[GHL Marketplace Webhook] - x-ghl-signature:', signature ? 'present' : 'missing')
    console.log('[GHL Marketplace Webhook] - x-ghl-timestamp:', timestamp ? 'present' : 'missing')
    console.log('[GHL Marketplace Webhook] - All headers:', Object.fromEntries(request.headers.entries()))
    
    // Get raw body for signature verification
    const rawBody = await request.text()
    console.log('[GHL Marketplace Webhook] Raw body length:', rawBody.length)
    console.log('[GHL Marketplace Webhook] Raw body preview:', rawBody.substring(0, 200))
    
    // Verify webhook signature
    const webhookSecret = process.env.GHL_MARKETPLACE_WEBHOOK_SECRET
    console.log('[GHL Marketplace Webhook] Webhook secret configured:', !!webhookSecret)
    
    if (webhookSecret && signature && timestamp) {
      const isValid = verifyWebhookSignature(rawBody, signature, timestamp, webhookSecret)
      console.log('[GHL Marketplace Webhook] Signature verification result:', isValid)
      if (!isValid) {
        console.error('[GHL Marketplace Webhook] Invalid signature - rejecting webhook')
        console.error('[GHL Marketplace Webhook] Expected signature format: HMAC-SHA256 of timestamp.payload')
        // Still log the webhook event for debugging
        await withPrisma(async (prisma) => {
          await prisma.webhookEvent.create({
            data: {
              processor: 'ghl_marketplace',
              eventType: 'signature_verification_failed',
              payload: { rawBody: rawBody.substring(0, 1000), signature, timestamp } as any,
              processed: true,
              processedAt: new Date(),
              error: 'Invalid webhook signature'
            }
          })
        })
        return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
      }
    } else {
      console.warn('[GHL Marketplace Webhook] Missing signature or secret - skipping verification')
      if (!webhookSecret) {
        console.warn('[GHL Marketplace Webhook] GHL_MARKETPLACE_WEBHOOK_SECRET not set in environment variables')
      }
      if (!signature) {
        console.warn('[GHL Marketplace Webhook] x-ghl-signature header missing - webhook may not be from GHL Marketplace')
      }
      if (!timestamp) {
        console.warn('[GHL Marketplace Webhook] x-ghl-timestamp header missing - webhook may not be from GHL Marketplace')
      }
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

    console.log('[GHL Marketplace Webhook] Received webhook event type:', eventType)
    console.log('[GHL Marketplace Webhook] Full payload keys:', Object.keys(body))
    console.log('[GHL Marketplace Webhook] Payload structure:', JSON.stringify(body, null, 2).substring(0, 500))

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
    const locationId = (body as any).locationId || (body as any).location?.id || (body as any).locationId
    const accountId = (body as any).accountId || (body as any).account?.id
    
    console.log('[GHL Marketplace Webhook] Extracted locationId:', locationId)
    console.log('[GHL Marketplace Webhook] Extracted accountId:', accountId)
    console.log('[GHL Marketplace Webhook] Searching for locationId in payload paths:')
    console.log('[GHL Marketplace Webhook] - body.locationId:', (body as any).locationId)
    console.log('[GHL Marketplace Webhook] - body.location?.id:', (body as any).location?.id)
    console.log('[GHL Marketplace Webhook] - body.data?.locationId:', (body as any).data?.locationId)
    console.log('[GHL Marketplace Webhook] - body.triggerData?.locationId:', (body as any).triggerData?.locationId)

    if (!locationId && !accountId) {
      console.error('[GHL Marketplace Webhook] No locationId or accountId in payload')
      console.error('[GHL Marketplace Webhook] Full payload for debugging:', JSON.stringify(body, null, 2))
      await withPrisma(async (prisma) => {
        if (webhookEventId) {
          await prisma.webhookEvent.update({
            where: { id: webhookEventId as string },
            data: {
              processed: true,
              processedAt: new Date(),
              error: 'No locationId or accountId in payload'
            }
          })
        }
      })
      // Return 200 to prevent GHL from retrying (webhook is logged for debugging)
      return NextResponse.json({ received: true, message: 'Missing location information' })
    }

    // Find company by locationId (GHL location ID)
    const company = await withPrisma(async (prisma) => {
      const found = await prisma.company.findFirst({
        where: {
          ghlLocationId: locationId || undefined
        }
      })
      console.log('[GHL Marketplace Webhook] Company lookup result:', found ? `Found: ${found.id} (${found.name})` : 'Not found')
      return found
    })

    if (!company) {
      console.warn(`[GHL Marketplace Webhook] Company not found for locationId: ${locationId}`)
      console.warn('[GHL Marketplace Webhook] Checking all companies with ghlLocationId...')
      // Debug: List all companies with location IDs
      await withPrisma(async (prisma) => {
        const allCompanies = await prisma.company.findMany({
          where: {
            ghlLocationId: { not: null }
          },
          select: {
            id: true,
            name: true,
            ghlLocationId: true
          }
        })
        console.warn('[GHL Marketplace Webhook] Companies with location IDs:', allCompanies.map(c => ({
          name: c.name,
          locationId: c.ghlLocationId
        })))
      })
      
      await withPrisma(async (prisma) => {
        if (webhookEventId) {
          await prisma.webhookEvent.update({
            where: { id: webhookEventId as string },
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
    const normalizedEventType = eventType.toLowerCase()
    console.log(`[GHL Marketplace Webhook] Routing event type: ${normalizedEventType}`)
    
    switch (normalizedEventType) {
      case 'appointment.created':
      case 'appointmentcreate':
      case 'appointment_create':
        console.log('[GHL Marketplace Webhook] Handling appointment.created')
        await handleAppointmentCreated(normalizedWebhook, company as any)
        break

      case 'appointment.updated':
      case 'appointmentupdate':
      case 'appointment_update':
        console.log('[GHL Marketplace Webhook] Handling appointment.updated')
        await handleAppointmentUpdated(normalizedWebhook, company as any)
        break

      case 'appointment.cancelled':
      case 'appointmentcancel':
      case 'appointment.canceled':
      case 'appointment_cancelled':
        console.log('[GHL Marketplace Webhook] Handling appointment.cancelled')
        await handleAppointmentCancelled(normalizedWebhook, company as any)
        break

      case 'appointment.rescheduled':
      case 'appointmentreschedule':
      case 'appointment_rescheduled':
        console.log('[GHL Marketplace Webhook] Handling appointment.rescheduled')
        await handleAppointmentRescheduled(normalizedWebhook, company as any)
        break

      case 'install':
      case 'app.installed':
        console.log('[GHL Marketplace Webhook] Handling app installation event')
        // Installation events are handled separately - just log for now
        break

      case 'uninstall':
      case 'app.uninstalled':
        console.log('[GHL Marketplace Webhook] Handling app uninstallation event')
        // Uninstallation events are handled separately - just log for now
        break

      default:
        console.log(`[GHL Marketplace Webhook] Unhandled event type: ${eventType}`)
        console.log('[GHL Marketplace Webhook] Available event types: appointment.created, appointment.updated, appointment.cancelled, appointment.rescheduled, install, uninstall')
        // Still mark as processed
    }

    // Mark webhook event as processed
    await withPrisma(async (prisma) => {
      if (webhookEventId) {
        await prisma.webhookEvent.update({
          where: { id: webhookEventId as string },
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
          where: { id: webhookEventId as string },
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

