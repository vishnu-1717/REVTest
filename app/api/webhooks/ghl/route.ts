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
    console.log('[GHL Webhook] Payload type:', typeof body)
    
    // Deep search for appointment-related fields (might be anywhere in the payload)
    const searchForAppointmentFields = (obj: any, path: string = ''): void => {
      if (!obj || typeof obj !== 'object') return
      
      Object.keys(obj).forEach(key => {
        const currentPath = path ? `${path}.${key}` : key
        const value = obj[key]
        
        // Check if key contains appointment-related terms
        if (key.toLowerCase().includes('appointment') || 
            key.toLowerCase().includes('appt') ||
            key.toLowerCase().includes('start_time') ||
            key.toLowerCase().includes('starttime') ||
            key.toLowerCase().includes('end_time') ||
            key.toLowerCase().includes('endtime') ||
            key.toLowerCase().includes('status') ||
            key.toLowerCase().includes('calendar_id') ||
            key.toLowerCase().includes('calendarid') ||
            key.toLowerCase().includes('assigned_user') ||
            key.toLowerCase().includes('assigneduser')) {
          console.log(`[GHL Webhook] Found appointment-related field: ${currentPath} =`, value)
        }
        
        // Recursively search nested objects (but not arrays or null)
        if (value && typeof value === 'object' && !Array.isArray(value)) {
          searchForAppointmentFields(value, currentPath)
        }
      })
    }
    
    console.log('[GHL Webhook] Searching for appointment-related fields...')
    searchForAppointmentFields(body)
    
    // Check common places where appointment data might be
    console.log('[GHL Webhook] Checking common appointment data locations:')
    console.log('[GHL Webhook] - body.appointment:', body.appointment)
    console.log('[GHL Webhook] - body.triggerData:', body.triggerData)
    console.log('[GHL Webhook] - body.appointment_id:', body.appointment_id)
    console.log('[GHL Webhook] - body.appointmentId:', body.appointmentId)
    console.log('[GHL Webhook] - body.start_time:', body.start_time)
    console.log('[GHL Webhook] - body.startTime:', body.startTime)
    
    // GHL might send data in different structures:
    // 1. Direct: { type: "Appointment", id: "...", ... }
    // 2. Nested in customData: { customData: { type: "Appointment", ... } }
    // 3. Nested in data: { data: { type: "Appointment", ... } }
    // 4. Nested in event: { event: { type: "...", ... }, locationId: "..." }
    // 5. Workflow format: { customData: {...}, location: { id: "..." }, contact_id: "..." }
    
    let webhookData: any = body
    
    // Extract appointment data from multiple possible locations
    // GHL appointment triggers can place data in various structures
    const extractAppointmentData = (body: any) => {
      let appointmentId = ''
      let startTime = ''
      let endTime = ''
      let appointmentStatus = ''
      let calendarId = ''
      let assignedUserId = ''
      
      // Check customData first (workflow payload structure)
      if (body.customData) {
        appointmentId = body.customData.appointmentId || body.customData.appointment_id || body.customData.id || ''
        startTime = body.customData.startTime || body.customData.start_time || body.customData.scheduledAt || ''
        endTime = body.customData.endTime || body.customData.end_time || ''
        appointmentStatus = body.customData.appointmentStatus || body.customData.status || body.customData.appointment_status || ''
        calendarId = body.customData.calendarId || body.customData.calendar_id || ''
        assignedUserId = body.customData.assignedUserId || body.customData.assigned_user_id || body.customData.assignedUser || ''
      }
      
      // Check appointment object (if GHL sends it as an object)
      if (body.appointment) {
        appointmentId = appointmentId || body.appointment.id || body.appointment.appointmentId || body.appointment.appointment_id || ''
        startTime = startTime || body.appointment.startTime || body.appointment.start_time || body.appointment.scheduledAt || ''
        endTime = endTime || body.appointment.endTime || body.appointment.end_time || ''
        appointmentStatus = appointmentStatus || body.appointment.status || body.appointment.appointmentStatus || ''
        calendarId = calendarId || body.appointment.calendarId || body.appointment.calendar_id || ''
        assignedUserId = assignedUserId || body.appointment.assignedUserId || body.appointment.assigned_user_id || ''
      }
      
      // Check triggerData (trigger-specific data)
      if (body.triggerData?.appointment) {
        appointmentId = appointmentId || body.triggerData.appointment.id || body.triggerData.appointment.appointmentId || ''
        startTime = startTime || body.triggerData.appointment.startTime || body.triggerData.appointment.start_time || ''
        endTime = endTime || body.triggerData.appointment.endTime || body.triggerData.appointment.end_time || ''
        appointmentStatus = appointmentStatus || body.triggerData.appointment.status || ''
        calendarId = calendarId || body.triggerData.appointment.calendarId || body.triggerData.appointment.calendar_id || ''
      }
      
      // Check root level (snake_case or camelCase)
      appointmentId = appointmentId || body.appointmentId || body.appointment_id || body.id || ''
      startTime = startTime || body.startTime || body.start_time || body.scheduledAt || body.scheduled_at || ''
      endTime = endTime || body.endTime || body.end_time || ''
      appointmentStatus = appointmentStatus || body.appointmentStatus || body.status || body.appointment_status || ''
      calendarId = calendarId || body.calendarId || body.calendar_id || ''
      assignedUserId = assignedUserId || body.assignedUserId || body.assigned_user_id || body.assignedUser || ''
      
      // Check custom fields that might contain appointment data (fallback)
      if (!appointmentId) {
        appointmentId = body['PCN - Appointment ID'] || body['Call Notes - Appointment ID'] || ''
      }
      if (!startTime) {
        startTime = body['Appointment Date'] || body['Call Booked Date'] || body['Appointment Confirmed Date'] || ''
      }
      
      return {
        appointmentId,
        startTime,
        endTime,
        appointmentStatus,
        calendarId,
        assignedUserId
      }
    }
    
    const appointmentData = extractAppointmentData(body)
    console.log('[GHL Webhook] Extracted appointment data:', JSON.stringify(appointmentData, null, 2))
    
    // Check if data is in customData (GHL workflow format)
    if (body.customData && typeof body.customData === 'object') {
      console.log('[GHL Webhook] Data found nested in body.customData')
      // Merge customData with location from root level if available
      webhookData = {
        ...body.customData,
        locationId: body.customData.locationId || body.location?.id || body.locationId,
        contactId: body.customData.contactId || body.contact_id,
        // Use extracted appointment data
        appointmentId: appointmentData.appointmentId,
        startTime: appointmentData.startTime,
        endTime: appointmentData.endTime,
        appointmentStatus: appointmentData.appointmentStatus,
        calendarId: appointmentData.calendarId,
        assignedUserId: appointmentData.assignedUserId,
        // Also include other root-level data that might be useful
        contactEmail: body.email,
        contactPhone: body.phone,
        contactName: body.full_name || `${body.first_name || ''} ${body.last_name || ''}`.trim(),
        // Store all custom fields for attribution resolution
        allCustomFields: body
      }
    }
    // Check if data is nested in body.data
    else if (body.data && typeof body.data === 'object') {
      console.log('[GHL Webhook] Data found nested in body.data')
      webhookData = { 
        ...body.data, 
        locationId: body.locationId || body.data.locationId || body.location?.id,
        // Merge extracted appointment data
        appointmentId: appointmentData.appointmentId || body.data.appointmentId,
        startTime: appointmentData.startTime || body.data.startTime,
        endTime: appointmentData.endTime || body.data.endTime,
        appointmentStatus: appointmentData.appointmentStatus || body.data.appointmentStatus,
        calendarId: appointmentData.calendarId || body.data.calendarId,
        assignedUserId: appointmentData.assignedUserId || body.data.assignedUserId,
      }
    }
    // Check if event is nested
    else if (body.event && typeof body.event === 'object') {
      console.log('[GHL Webhook] Data found nested in body.event')
      webhookData = { 
        ...body.event, 
        locationId: body.locationId || body.event.locationId || body.location?.id,
        // Merge extracted appointment data
        appointmentId: appointmentData.appointmentId || body.event.appointmentId,
        startTime: appointmentData.startTime || body.event.startTime,
        endTime: appointmentData.endTime || body.event.endTime,
        appointmentStatus: appointmentData.appointmentStatus || body.event.appointmentStatus,
        calendarId: appointmentData.calendarId || body.event.calendarId,
        assignedUserId: appointmentData.assignedUserId || body.event.assignedUserId,
      }
    }
    // Check if location is at root and might need extraction (direct format)
    else if (body.location?.id || body.contact_id) {
      console.log('[GHL Webhook] Found location.id at root level - using direct format')
      webhookData = { 
        ...body, 
        locationId: body.location?.id || body.locationId,
        // Merge extracted appointment data
        appointmentId: appointmentData.appointmentId,
        startTime: appointmentData.startTime,
        endTime: appointmentData.endTime,
        appointmentStatus: appointmentData.appointmentStatus,
        calendarId: appointmentData.calendarId,
        assignedUserId: appointmentData.assignedUserId,
        contactId: body.contact_id || body.contactId,
        contactEmail: body.email,
        contactPhone: body.phone,
        contactName: body.full_name || `${body.first_name || ''} ${body.last_name || ''}`.trim(),
      }
    }
    
    console.log('[GHL Webhook] Extracted webhook data:', JSON.stringify(webhookData, null, 2))
    console.log('[GHL Webhook] Type:', webhookData.type, '| ID:', webhookData.id, '| AppointmentId:', webhookData.appointmentId, '| LocationId:', webhookData.locationId)
    
    // Type guard - check if this looks like our expected format
    const webhook = webhookData as GHLWebhook
    
    // Check if this is an appointment webhook
    // Handle cases where type is in customData but appointment data might be sparse
    const isAppointmentWebhook = 
      webhook.type === 'Appointment' || 
      webhook.appointmentId || 
      webhook.appointmentStatus ||
      (body.customData?.type === 'Appointment') ||
      (body.workflow?.name?.toLowerCase().includes('appointment') || body.workflow?.name?.toLowerCase().includes('webhook'))
    
    if (!isAppointmentWebhook) {
      console.log('[GHL Webhook] Not an appointment webhook, ignoring. Type:', webhook.type, '| CustomData type:', body.customData?.type)
      return NextResponse.json({ received: true })
    }
    
    // If customData fields are empty but we have location/contact, this might be a contact update
    // that references an appointment. Try to find appointment information elsewhere or use contact data
    if (webhook.type === 'Appointment' && !webhook.appointmentId && !webhook.startTime) {
      console.log('[GHL Webhook] Appointment webhook detected but appointment fields are empty. May be a contact update or appointment creation trigger.')
      // We'll still try to process it if we have location and contact
    }
    
    // Validate required fields
    if (!webhook.locationId) {
      // Try to get locationId from body.location.id if not in webhook
      if (body.location?.id) {
        webhook.locationId = body.location.id
        console.log('[GHL Webhook] Extracted locationId from body.location.id:', webhook.locationId)
      } else {
        console.error('[GHL Webhook] Missing locationId in payload')
        return NextResponse.json({ error: 'Missing locationId' }, { status: 400 })
      }
    }
    
    // If appointmentId is empty but we have contact, sync the contact data anyway
    // This might be a workflow trigger before appointment is created, or merge fields aren't working
    if (!webhook.appointmentId && webhook.locationId && webhook.contactId) {
      console.warn('[GHL Webhook] Appointment webhook received but appointmentId is missing.')
      console.log('[GHL Webhook] However, we can sync contact data. Attempting contact sync...')
      
      // Still find company and sync contact
      const company = await withPrisma(async (prisma) => {
        return await prisma.company.findFirst({
          where: { ghlLocationId: webhook.locationId }
        })
      })
      
      if (company && webhook.contactId) {
        // Sync/update contact with available data
        const contactData: any = {
          name: (webhook as any).contactName || body.full_name || `${body.first_name || ''} ${body.last_name || ''}`.trim(),
          email: (webhook as any).contactEmail || body.email,
          phone: (webhook as any).contactPhone || body.phone,
          tags: body.tags ? body.tags.split(',').map((t: string) => t.trim()) : [],
          customFields: body // Store all custom fields for attribution
        }
        
        // Find or create contact
        let contact = await withPrisma(async (prisma) => {
          let existing = await prisma.contact.findFirst({
            where: {
              companyId: company.id,
              ghlContactId: webhook.contactId
            }
          })
          
          if (existing) {
            return await prisma.contact.update({
              where: { id: existing.id },
              data: contactData
            })
          } else {
            return await prisma.contact.create({
              data: {
                companyId: company.id,
                ghlContactId: webhook.contactId,
                ...contactData
              }
            })
          }
        })
        
        console.log('[GHL Webhook] Contact synced:', contact.id, 'Name:', contact.name)
        
        return NextResponse.json({ 
          received: true, 
          warning: 'Appointment webhook received but appointmentId is missing. Contact synced successfully.',
          syncedContact: contact.id
        })
      }
      
      return NextResponse.json({ 
        received: true, 
        warning: 'Appointment webhook received but appointmentId is missing. Please check GHL workflow merge fields.' 
      })
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