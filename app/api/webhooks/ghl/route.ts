import { NextRequest, NextResponse } from 'next/server'
import { withPrisma } from '@/lib/db'
import { GHLClient } from '@/lib/ghl-api'
import { resolveAttribution } from '@/lib/attribution'

interface GHLWebhook {
  type: string
  id: string
  locationId: string
  
  // Appointment fields
  appointmentId?: string
  contactId?: string
  calendarId?: string
  assignedUserId?: string
  appointmentStatus?: string
  startTime?: string
  endTime?: string
  title?: string
  notes?: string
  
  customFields?: Record<string, any>
}

export async function POST(request: NextRequest) {
  try {
    // Log the raw request for debugging
    const rawBody = await request.text()
    console.log('[GHL Webhook] Raw payload received:', rawBody)
    
    // Parse JSON payload
    let body: any
    try {
      body = JSON.parse(rawBody)
    } catch (parseError) {
      console.error('[GHL Webhook] JSON parse error:', parseError)
      console.error('[GHL Webhook] Raw body that failed to parse:', rawBody)
      return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 })
    }
    
    // Log the parsed payload structure
    console.log('[GHL Webhook] Parsed payload:', JSON.stringify(body, null, 2))
    console.log('[GHL Webhook] Payload keys:', Object.keys(body))
    console.log('[GHL Webhook] Type:', body.type, '| ID:', body.id, '| LocationId:', body.locationId)
    
    // Type guard - check if this looks like our expected format
    const webhook = body as GHLWebhook
    
    // Only process appointment webhooks
    if (webhook.type !== 'Appointment' && !webhook.appointmentId && !webhook.appointmentStatus) {
      console.log('[GHL Webhook] Not an appointment webhook, ignoring. Type:', webhook.type)
      return NextResponse.json({ received: true })
    }
    
    // Validate required fields
    if (!webhook.locationId) {
      console.error('[GHL Webhook] Missing locationId in payload')
      return NextResponse.json({ error: 'Missing locationId' }, { status: 400 })
    }
    
    // Find company by GHL location ID
    const company = await withPrisma(async (prisma) => {
      return await prisma.company.findFirst({
        where: { ghlLocationId: webhook.locationId }
      })
    })
    
    if (!company) {
      console.error('[GHL Webhook] Company not found for location:', webhook.locationId)
      return NextResponse.json({ error: 'Company not found' }, { status: 404 })
    }
    
    console.log('[GHL Webhook] Found company:', company.id, company.name)
    
    // Handle different appointment events
    switch (webhook.appointmentStatus) {
      case 'confirmed':
      case 'scheduled':
        console.log('[GHL Webhook] Processing appointment created/confirmed')
        await handleAppointmentCreated(webhook, company)
        break
      
      case 'cancelled':
        console.log('[GHL Webhook] Processing appointment cancelled')
        await handleAppointmentCancelled(webhook)
        break
      
      case 'rescheduled':
        console.log('[GHL Webhook] Processing appointment rescheduled')
        await handleAppointmentRescheduled(webhook, company)
        break
      
      default:
        console.log('[GHL Webhook] Processing appointment update (status:', webhook.appointmentStatus, ')')
        await handleAppointmentUpdated(webhook)
    }
    
    console.log('[GHL Webhook] Successfully processed webhook')
    return NextResponse.json({ received: true })
    
  } catch (error: any) {
    console.error('[GHL Webhook] Error processing webhook:', error)
    console.error('[GHL Webhook] Error stack:', error.stack)
    console.error('[GHL Webhook] Error details:', JSON.stringify(error, Object.getOwnPropertyNames(error)))
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

async function handleAppointmentCreated(webhook: GHLWebhook, company: any) {
  await withPrisma(async (prisma) => {
    // Find or create contact
    let contact = await prisma.contact.findFirst({
      where: {
        companyId: company.id,
        ghlContactId: webhook.contactId
      }
    })
    
    if (!contact && webhook.contactId && company.ghlApiKey) {
      // Fetch contact from GHL
      const ghl = new GHLClient(company.ghlApiKey, company.ghlLocationId || undefined)
      const ghlContact = await ghl.getContact(webhook.contactId)
      
      if (ghlContact) {
        contact = await prisma.contact.create({
          data: {
            companyId: company.id,
            ghlContactId: ghlContact.id,
            name: ghlContact.name || 'Unknown',
            email: ghlContact.email,
            phone: ghlContact.phone,
            tags: ghlContact.tags || [],
            customFields: ghlContact.customFields || {}
          }
        })
      }
    }
    
    if (!contact) {
      console.error('Could not create contact for appointment:', webhook.appointmentId)
      return
    }
    
    // Find calendar
    let calendar: any = null
    if (webhook.calendarId) {
      calendar = await prisma.calendar.findFirst({
        where: {
          companyId: company.id,
          ghlCalendarId: webhook.calendarId
        },
        include: { defaultCloser: true }
      })
    }
    
    // Find closer
    let closer: any = null
    
    // Priority 1: Use assignedUserId from GHL
    if (webhook.assignedUserId) {
      closer = await prisma.user.findFirst({
        where: {
          companyId: company.id,
          ghlUserId: webhook.assignedUserId
        }
      })
    }
    
    // Priority 2: Use calendar's default closer
    if (!closer && calendar?.defaultCloser) {
      closer = calendar.defaultCloser
    }
    
    // Determine if this is first call (not a reschedule/follow-up)
    const isFirstCall = !calendar?.calendarType?.match(/reschedule|follow.?up/i)
    
    // Create or update appointment
    let appointment = await prisma.appointment.findFirst({
      where: {
        ghlAppointmentId: webhook.appointmentId,
        companyId: company.id
      }
    })
    
    if (appointment) {
      // Update existing appointment
      appointment = await prisma.appointment.update({
        where: { id: appointment.id },
        data: {
          scheduledAt: new Date(webhook.startTime || Date.now()),
          closerId: closer?.id,
          calendarId: calendar?.id,
          notes: webhook.notes,
          customFields: webhook.customFields || {}
        }
      })
    } else {
      // Create new appointment
      appointment = await prisma.appointment.create({
        data: {
          companyId: company.id,
          contactId: contact.id,
          closerId: closer?.id,
          calendarId: calendar?.id,
          
          ghlAppointmentId: webhook.appointmentId,
          scheduledAt: new Date(webhook.startTime || Date.now()),
          
          status: 'scheduled',
          isFirstCall,
          
          notes: webhook.notes,
          customFields: webhook.customFields || {}
        }
      })
    }
    
    // Resolve attribution
    const attribution = await resolveAttribution(appointment.id)
    
    // Update appointment with attribution
    await prisma.appointment.update({
      where: { id: appointment.id },
      data: {
        attributionSource: attribution.trafficSource,
        leadSource: attribution.leadSource,
        customFields: {
          ...(appointment.customFields as Record<string, any> || {}),
          attributionConfidence: attribution.confidence
        }
      }
    })
    
    console.log('Appointment created:', appointment.id, 'Attribution:', attribution.trafficSource)
  })
}

async function handleAppointmentCancelled(webhook: GHLWebhook) {
  await withPrisma(async (prisma) => {
    const appointment = await prisma.appointment.findFirst({
      where: { ghlAppointmentId: webhook.appointmentId }
    })
    
    if (!appointment) return
    
    await prisma.appointment.update({
      where: { id: appointment.id },
      data: { status: 'cancelled' }
    })
  })
}

async function handleAppointmentRescheduled(webhook: GHLWebhook, company: any) {
  await withPrisma(async (prisma) => {
    const existing = await prisma.appointment.findFirst({
      where: { ghlAppointmentId: webhook.appointmentId }
    })
    
    if (!existing) {
      // Treat as new appointment
      await handleAppointmentCreated(webhook, company)
      return
    }
    
    // Update existing appointment
    await prisma.appointment.update({
      where: { id: existing.id },
      data: {
        scheduledAt: new Date(webhook.startTime || Date.now()),
        status: 'scheduled',
        customFields: {
          ...(existing.customFields as Record<string, any> || {}),
          rescheduledCount: ((existing.customFields as any)?.rescheduledCount || 0) + 1
        }
      }
    })
  })
}

async function handleAppointmentUpdated(webhook: GHLWebhook) {
  await withPrisma(async (prisma) => {
    const appointment = await prisma.appointment.findFirst({
      where: { ghlAppointmentId: webhook.appointmentId }
    })
    
    if (!appointment) return
    
    await prisma.appointment.update({
      where: { id: appointment.id },
      data: {
        scheduledAt: webhook.startTime ? new Date(webhook.startTime) : undefined,
        notes: webhook.notes,
        customFields: webhook.customFields
      }
    })
  })
}