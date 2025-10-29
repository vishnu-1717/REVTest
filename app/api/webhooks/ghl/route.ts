import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
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
    const body = await request.json() as GHLWebhook
    
    console.log('GHL Webhook received:', body.type, body.id)
    
    // Only process appointment webhooks
    if (body.type !== 'Appointment') {
      return NextResponse.json({ received: true })
    }
    
    // Find company by GHL location ID
    const company = await prisma.company.findFirst({
      where: { ghlLocationId: body.locationId }
    })
    
    if (!company) {
      console.error('Company not found for location:', body.locationId)
      return NextResponse.json({ error: 'Company not found' }, { status: 404 })
    }
    
    // Handle different appointment events
    switch (body.appointmentStatus) {
      case 'confirmed':
      case 'scheduled':
        await handleAppointmentCreated(body, company)
        break
      
      case 'cancelled':
        await handleAppointmentCancelled(body)
        break
      
      case 'rescheduled':
        await handleAppointmentRescheduled(body, company)
        break
      
      default:
        await handleAppointmentUpdated(body)
    }
    
    return NextResponse.json({ received: true })
    
  } catch (error: any) {
    console.error('GHL webhook error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

async function handleAppointmentCreated(webhook: GHLWebhook, company: any) {
  // Find or create contact
  let contact = await prisma.contact.findFirst({
    where: {
      companyId: company.id,
      ghlContactId: webhook.contactId
    }
  })
  
  if (!contact && webhook.contactId && company.ghlApiKey) {
    // Fetch contact from GHL
    const ghl = new GHLClient(company.ghlApiKey)
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
  
  // Create appointment
  const appointment = await prisma.appointment.upsert({
    where: {
      ghlAppointmentId: webhook.appointmentId
    },
    create: {
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
    },
    update: {
      scheduledAt: new Date(webhook.startTime || Date.now()),
      closerId: closer?.id,
      calendarId: calendar?.id,
      notes: webhook.notes,
      customFields: webhook.customFields || {}
    }
  })
  
  // Resolve attribution
  const attribution = await resolveAttribution(appointment.id)
  
  // Update appointment with attribution
  await prisma.appointment.update({
    where: { id: appointment.id },
    data: {
      attributionSource: attribution.trafficSource,
      leadSource: attribution.leadSource,
      customFields: {
        ...appointment.customFields,
        attributionConfidence: attribution.confidence
      }
    }
  })
  
  console.log('Appointment created:', appointment.id, 'Attribution:', attribution.trafficSource)
}

async function handleAppointmentCancelled(webhook: GHLWebhook) {
  const appointment = await prisma.appointment.findUnique({
    where: { ghlAppointmentId: webhook.appointmentId }
  })
  
  if (!appointment) return
  
  await prisma.appointment.update({
    where: { id: appointment.id },
    data: { status: 'cancelled' }
  })
}

async function handleAppointmentRescheduled(webhook: GHLWebhook, company: any) {
  const existing = await prisma.appointment.findUnique({
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
        ...existing.customFields,
        rescheduledCount: ((existing.customFields as any)?.rescheduledCount || 0) + 1
      }
    }
  })
}

async function handleAppointmentUpdated(webhook: GHLWebhook) {
  const appointment = await prisma.appointment.findUnique({
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
}
