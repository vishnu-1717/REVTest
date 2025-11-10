import { NextRequest, NextResponse } from 'next/server'
import { withPrisma } from '@/lib/db'
import { GHLClient } from '@/lib/ghl-api'
import { GHLWebhook } from '@/types'
import { parseGHLDate } from '@/lib/webhooks/utils'
import {
  handleAppointmentCreated,
  handleAppointmentCancelled,
  handleAppointmentRescheduled,
  handleAppointmentUpdated
} from '@/lib/webhooks/handlers'

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
    // PRIORITY ORDER: Root level first (actual GHL appointment payload structure),
    // then nested structures, then custom fields
    const extractAppointmentData = (body: any) => {
      let appointmentId = ''
      let startTime = ''
      let endTime = ''
      let appointmentStatus = ''
      let calendarId = ''
      let calendarName = ''
      let assignedUserId = ''
      let title = ''
      let notes = ''
      
      // PRIORITY 1: Check root level FIRST - this is where GHL sends the actual appointment object
      // Based on GHL payload structure: id, startTime, endTime, appointmentStatus, calendarId, contactId, locationId, etc.
      appointmentId = body.id || body.appointmentId || body.appointment_id || ''
      startTime = body.startTime || body.start_time || body.scheduledAt || body.scheduled_at || ''
      endTime = body.endTime || body.end_time || ''
      appointmentStatus = body.appointmentStatus || body.status || body.appointment_status || ''
      
      // Check for calendarId in calendar object (GHL sends calendar data in body.calendar)
      calendarId = body.calendarId || body.calendar_id || body.calendar?.id || ''
      calendarName = body.calendarName || body.calendar?.calendarName || body.calendar?.name || ''
      
      assignedUserId = body.assignedUserId || body.assigned_user_id || body.assignedUser || ''
      title = body.title || body.name || ''
      notes = body.notes || body.description || ''
      
      // PRIORITY 2: Check appointment object (if GHL wraps it in an appointment property)
      if (body.appointment && typeof body.appointment === 'object') {
        appointmentId = appointmentId || body.appointment.id || body.appointment.appointmentId || body.appointment.appointment_id || ''
        startTime = startTime || body.appointment.startTime || body.appointment.start_time || body.appointment.scheduledAt || ''
        endTime = endTime || body.appointment.endTime || body.appointment.end_time || ''
        appointmentStatus = appointmentStatus || body.appointment.appointmentStatus || body.appointment.status || ''
        calendarId = calendarId || body.appointment.calendarId || body.appointment.calendar_id || ''
        assignedUserId = assignedUserId || body.appointment.assignedUserId || body.appointment.assigned_user_id || ''
        title = title || body.appointment.title || body.appointment.name || ''
        notes = notes || body.appointment.notes || body.appointment.description || ''
      }
      
      // PRIORITY 3: Check triggerData (trigger-specific data)
      if (body.triggerData?.appointment) {
        appointmentId = appointmentId || body.triggerData.appointment.id || body.triggerData.appointment.appointmentId || ''
        startTime = startTime || body.triggerData.appointment.startTime || body.triggerData.appointment.start_time || ''
        endTime = endTime || body.triggerData.appointment.endTime || body.triggerData.appointment.end_time || ''
        appointmentStatus = appointmentStatus || body.triggerData.appointment.status || body.triggerData.appointment.appointmentStatus || ''
        calendarId = calendarId || body.triggerData.appointment.calendarId || body.triggerData.appointment.calendar_id || ''
      }
      
      // PRIORITY 4: Check customData (workflow payload structure - merge fields may be here)
      if (body.customData && typeof body.customData === 'object') {
        appointmentId = appointmentId || body.customData.appointmentId || body.customData.appointment_id || body.customData.id || ''
        startTime = startTime || body.customData.startTime || body.customData.start_time || body.customData.scheduledAt || ''
        endTime = endTime || body.customData.endTime || body.customData.end_time || ''
        appointmentStatus = appointmentStatus || body.customData.appointmentStatus || body.customData.status || body.customData.appointment_status || ''
        calendarId = calendarId || body.customData.calendarId || body.customData.calendar_id || ''
        assignedUserId = assignedUserId || body.customData.assignedUserId || body.customData.assigned_user_id || body.customData.assignedUser || ''
        title = title || body.customData.title || ''
        notes = notes || body.customData.notes || ''
      }
      
      // PRIORITY 5: Check custom field names (company-specific fields as fallback)
      if (!appointmentId) {
        appointmentId = body['PCN - Appointment ID'] || body['Call Notes - Appointment ID'] || ''
      }
      if (!startTime) {
        startTime = body['Appointment Date'] || body['Call Booked Date'] || body['Appointment Confirmed Date'] || ''
      }
      
      // PRIORITY 6: Check body.calendar structure for appointmentId (GHL might nest it)
      if (!appointmentId && body.calendar && typeof body.calendar === 'object') {
        appointmentId = body.calendar.appointmentId || body.calendar.id || ''
      }
      
      return {
        appointmentId,
        startTime,
        endTime,
        appointmentStatus,
        calendarId,
        calendarName,
        assignedUserId,
        title,
        notes
      }
    }
    
    const appointmentData = extractAppointmentData(body)
    console.log('[GHL Webhook] Extracted appointment data:', JSON.stringify(appointmentData, null, 2))
    
    // If appointmentId still empty, log detailed error for debugging
    if (!appointmentData.appointmentId) {
      console.error('[GHL Webhook] ⚠️ APPOINTMENT ID MISSING IN PAYLOAD!')
      console.error('[GHL Webhook] This webhook will fail to create an appointment')
      console.error('[GHL Webhook] Payload structure:', Object.keys(body))
      console.error('[GHL Webhook] Body.calendar:', JSON.stringify(body.calendar, null, 2))
      console.error('[GHL Webhook] Body.customData:', JSON.stringify(body.customData, null, 2))
      console.error('[GHL Webhook] Body.triggerData:', JSON.stringify(body.triggerData, null, 2))
    }
    
    // PRIORITY: Check if body itself IS the appointment object (root level structure from GHL)
    // This happens when GHL sends the appointment directly at root level (as shown in your screenshot)
    if (appointmentData.appointmentId && body.locationId && (body.startTime || body.start_time || body.id)) {
      console.log('[GHL Webhook] Appointment data found at root level - using direct appointment structure')
      webhookData = {
        ...body,
        type: 'Appointment',
        appointmentId: appointmentData.appointmentId,
        startTime: appointmentData.startTime,
        endTime: appointmentData.endTime,
        appointmentStatus: appointmentData.appointmentStatus || body.appointmentStatus || body.status,
        calendarId: appointmentData.calendarId,
        calendarName: appointmentData.calendarName,
        assignedUserId: appointmentData.assignedUserId,
        title: appointmentData.title || body.title,
        notes: appointmentData.notes || body.notes,
        locationId: body.locationId,
        contactId: body.contactId || body.contact_id,
        // Parse dates to ISO strings for database storage
        startTimeParsed: appointmentData.startTime ? parseGHLDate(appointmentData.startTime) : null,
        endTimeParsed: appointmentData.endTime ? parseGHLDate(appointmentData.endTime) : null,
      }
    }
    // Check if data is in customData (GHL workflow format)
    else if (body.customData && typeof body.customData === 'object') {
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
        calendarName: appointmentData.calendarName,
        assignedUserId: appointmentData.assignedUserId,
        title: appointmentData.title,
        notes: appointmentData.notes,
        // Parse dates
        startTimeParsed: appointmentData.startTime ? parseGHLDate(appointmentData.startTime) : null,
        endTimeParsed: appointmentData.endTime ? parseGHLDate(appointmentData.endTime) : null,
        // Also include other root-level data that might be useful
        contactEmail: body.email,
        contactPhone: body.phone,
        contactName: body.full_name || `${body.first_name || ''} ${body.last_name || ''}`.trim(),
        firstName: body.first_name,
        lastName: body.last_name,
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
        calendarName: appointmentData.calendarName,
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
        calendarName: appointmentData.calendarName,
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
        calendarName: appointmentData.calendarName,
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
    
    // Find company by GHL location ID (needed for both API fetch and normal processing)
    let company = await withPrisma(async (prisma) => {
      const found = await prisma.company.findFirst({
        where: { ghlLocationId: webhook.locationId }
      })
      console.log('[GHL Webhook] Looking for company with locationId:', webhook.locationId)
      if (found) {
        console.log('[GHL Webhook] Found company:', found.name, 'ID:', found.id, 'LocationId:', found.ghlLocationId)
      } else {
        console.log('[GHL Webhook] No company found with that locationId. Available companies:')
        const allCompanies = await prisma.company.findMany({ select: { id: true, name: true, ghlLocationId: true } })
        allCompanies.forEach(c => console.log(`  - ${c.name} (ID: ${c.id}, LocationId: ${c.ghlLocationId || 'null'})`))
      }
      return found
    })
    
    if (!company) {
      console.error('[GHL Webhook] Company not found for location:', webhook.locationId)
      return NextResponse.json({ error: `Company not found for GHL locationId: ${webhook.locationId}. Please configure this locationId in your company settings.` }, { status: 404 })
    }
    
    // If appointmentId is empty but we have contact, try fetching from GHL API
    // This might be a workflow trigger before appointment is created, or merge fields aren't working
    if (!webhook.appointmentId && webhook.locationId && webhook.contactId) {
      console.warn('[GHL Webhook] Appointment webhook received but appointmentId is missing.')
      console.log('[GHL Webhook] Attempting to fetch appointment data from GHL API using contactId...')
      
      if (company && company.ghlApiKey) {
        // Try to fetch appointment data from GHL API
        // Note: Appointment may not be fully committed yet, so we retry with delay
        try {
          const ghl = new GHLClient(company.ghlApiKey, company.ghlLocationId || undefined)
          
          // First attempt - immediate
          let appointments = await ghl.getContactAppointments(webhook.contactId)
          
          // If no appointments found, wait a moment and retry (appointment might be committing)
          if (!appointments || appointments.length === 0) {
            console.log('[GHL Webhook] No appointments found immediately, waiting 2 seconds for appointment to commit...')
            await new Promise(resolve => setTimeout(resolve, 2000))
            appointments = await ghl.getContactAppointments(webhook.contactId)
          }
          
          // Second retry if still empty
          if (!appointments || appointments.length === 0) {
            console.log('[GHL Webhook] Still no appointments, waiting 3 more seconds...')
            await new Promise(resolve => setTimeout(resolve, 3000))
            appointments = await ghl.getContactAppointments(webhook.contactId)
          }
          
          if (appointments && appointments.length > 0) {
            console.log(`[GHL Webhook] Found ${appointments.length} appointments after retries`)
            // Get the most recent appointment (usually the one that triggered this webhook)
            // Sort by startTime or dateCreated descending
            const sortedAppointments = appointments.sort((a: any, b: any) => {
              const dateA = new Date(a.startTime || a.scheduledAt || a.createdAt || 0).getTime()
              const dateB = new Date(b.startTime || b.scheduledAt || b.createdAt || 0).getTime()
              return dateB - dateA
            })
            
            const latestAppointment = sortedAppointments[0]
            console.log('[GHL Webhook] Found appointment via API:', latestAppointment.id)
            
            // Populate webhook data from API response
            webhook.appointmentId = latestAppointment.id || latestAppointment.appointmentId
            webhook.startTime = latestAppointment.startTime || latestAppointment.scheduledAt || latestAppointment.start_time
            webhook.endTime = latestAppointment.endTime || latestAppointment.end_time
            webhook.appointmentStatus = latestAppointment.status || latestAppointment.appointmentStatus || 'scheduled'
            webhook.calendarId = latestAppointment.calendarId || latestAppointment.calendar_id || ''
            webhook.assignedUserId = latestAppointment.assignedUserId || latestAppointment.assigned_user_id || ''
            webhook.title = latestAppointment.title || latestAppointment.name || ''
            webhook.notes = latestAppointment.notes || latestAppointment.description || ''
            
            console.log('[GHL Webhook] Successfully populated appointment data from GHL API')
          } else {
            console.warn('[GHL Webhook] No appointments found for contact via API. Proceeding with contact sync only.')
          }
        } catch (apiError: any) {
          console.error('[GHL Webhook] Failed to fetch appointment from GHL API:', apiError.message)
          console.log('[GHL Webhook] Proceeding with contact sync only...')
        }
      }
      
      // If we still don't have appointmentId after API fetch, proceed with contact sync only
      if (!webhook.appointmentId && company && webhook.contactId) {
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
      
      // If we still don't have appointmentId and no company/contact, return error
      if (!webhook.appointmentId) {
        return NextResponse.json({ 
          received: true, 
          warning: 'Appointment webhook received but appointmentId is missing. Please check GHL workflow merge fields.' 
        })
      }
      
      // If we successfully fetched appointmentId from API, continue with normal appointment processing
      console.log('[GHL Webhook] AppointmentId obtained from API, continuing with normal appointment processing')
    }
    
    console.log('[GHL Webhook] Found company:', company.id, company.name)
    
    // Handle different appointment events
    // Note: appointmentStatus might be empty, so check if we have an appointmentId and treat as created
    if (!webhook.appointmentStatus || webhook.appointmentStatus === '') {
      if (webhook.appointmentId) {
        console.log('[GHL Webhook] No appointmentStatus provided but appointmentId exists, treating as created/confirmed')
        await handleAppointmentCreated(webhook, company)
      } else {
        console.log('[GHL Webhook] Processing appointment update (no status provided)')
        await handleAppointmentUpdated(webhook, company)
      }
    } else {
      switch (webhook.appointmentStatus.toLowerCase()) {
      case 'confirmed':
      case 'scheduled':
        case 'booked':
          console.log('[GHL Webhook] Processing appointment created/confirmed')
          await handleAppointmentCreated(webhook, company)
        break
      
      case 'cancelled':
        case 'canceled':
          console.log('[GHL Webhook] Processing appointment cancelled')
          await handleAppointmentCancelled(webhook, company)
        break
      
      case 'rescheduled':
          console.log('[GHL Webhook] Processing appointment rescheduled')
          await handleAppointmentRescheduled(webhook, company)
        break
      
      default:
          console.log('[GHL Webhook] Processing appointment update (status:', webhook.appointmentStatus, ')')
          await handleAppointmentUpdated(webhook, company)
      }
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