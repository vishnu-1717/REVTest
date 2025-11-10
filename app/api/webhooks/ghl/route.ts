import { NextRequest, NextResponse } from 'next/server'
import { withPrisma } from '@/lib/db'
import { GHLClient } from '@/lib/ghl-api'
import { GHLWebhookExtended, GHLWebhookPayload } from '@/types'
import { parseGHLDate } from '@/lib/webhooks/utils'
import {
  handleAppointmentCreated,
  handleAppointmentCancelled,
  handleAppointmentRescheduled,
  handleAppointmentUpdated
} from '@/lib/webhooks/handlers'

interface AppointmentData {
  appointmentId: string
  startTime: string
  endTime: string
  appointmentStatus: string
  calendarId: string
  calendarName: string
  assignedUserId: string
  title: string
  notes: string
}

// Helper function to safely extract string values from unknown types
function getStringValue(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

export async function POST(request: NextRequest) {
  try {
    // Log the raw request for debugging
    const rawBody = await request.text()
    console.log('[GHL Webhook] Raw payload received:', rawBody)
    
    // Parse JSON payload
    let body: GHLWebhookPayload
    try {
      body = JSON.parse(rawBody) as GHLWebhookPayload
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
    const searchForAppointmentFields = (obj: Record<string, unknown>, path: string = ''): void => {
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
          searchForAppointmentFields(value as Record<string, unknown>, currentPath)
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

    let webhookData: Partial<GHLWebhookExtended> = body as Partial<GHLWebhookExtended>

    // Extract appointment data from multiple possible locations
    // PRIORITY ORDER: Root level first (actual GHL appointment payload structure),
    // then nested structures, then custom fields
    const extractAppointmentData = (body: GHLWebhookPayload): AppointmentData => {
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
      appointmentId = getStringValue(body.id) || getStringValue(body.appointmentId) || getStringValue(body.appointment_id)
      startTime = getStringValue(body.startTime) || getStringValue(body.start_time) || getStringValue(body.scheduledAt) || getStringValue(body.scheduled_at)
      endTime = getStringValue(body.endTime) || getStringValue(body.end_time)
      appointmentStatus = getStringValue(body.appointmentStatus) || getStringValue(body.status) || getStringValue(body.appointment_status)

      // Check for calendarId in calendar object (GHL sends calendar data in body.calendar)
      calendarId = getStringValue(body.calendarId) || getStringValue(body.calendar_id)
      calendarName = getStringValue(body.calendarName)

      // Safely access calendar object properties
      if (body.calendar && typeof body.calendar === 'object' && !Array.isArray(body.calendar)) {
        const calendar = body.calendar as Record<string, unknown>
        calendarId = calendarId || getStringValue(calendar.id)
        calendarName = calendarName || getStringValue(calendar.calendarName) || getStringValue(calendar.name)
      }

      assignedUserId = getStringValue(body.assignedUserId) || getStringValue(body.assigned_user_id) || getStringValue(body.assignedUser)
      title = getStringValue(body.title) || getStringValue(body.name)
      notes = getStringValue(body.notes) || getStringValue(body.description)
      
      // PRIORITY 2: Check appointment object (if GHL wraps it in an appointment property)
      if (body.appointment && typeof body.appointment === 'object' && !Array.isArray(body.appointment)) {
        const appointment = body.appointment as Record<string, unknown>
        appointmentId = appointmentId || getStringValue(appointment.id) || getStringValue(appointment.appointmentId) || getStringValue(appointment.appointment_id)
        startTime = startTime || getStringValue(appointment.startTime) || getStringValue(appointment.start_time) || getStringValue(appointment.scheduledAt)
        endTime = endTime || getStringValue(appointment.endTime) || getStringValue(appointment.end_time)
        appointmentStatus = appointmentStatus || getStringValue(appointment.appointmentStatus) || getStringValue(appointment.status)
        calendarId = calendarId || getStringValue(appointment.calendarId) || getStringValue(appointment.calendar_id)
        assignedUserId = assignedUserId || getStringValue(appointment.assignedUserId) || getStringValue(appointment.assigned_user_id)
        title = title || getStringValue(appointment.title) || getStringValue(appointment.name)
        notes = notes || getStringValue(appointment.notes) || getStringValue(appointment.description)
      }

      // PRIORITY 3: Check triggerData (trigger-specific data)
      if (body.triggerData && typeof body.triggerData === 'object' && !Array.isArray(body.triggerData)) {
        const triggerData = body.triggerData as Record<string, unknown>
        if (triggerData.appointment && typeof triggerData.appointment === 'object' && !Array.isArray(triggerData.appointment)) {
          const triggerAppointment = triggerData.appointment as Record<string, unknown>
          appointmentId = appointmentId || getStringValue(triggerAppointment.id) || getStringValue(triggerAppointment.appointmentId)
          startTime = startTime || getStringValue(triggerAppointment.startTime) || getStringValue(triggerAppointment.start_time)
          endTime = endTime || getStringValue(triggerAppointment.endTime) || getStringValue(triggerAppointment.end_time)
          appointmentStatus = appointmentStatus || getStringValue(triggerAppointment.status) || getStringValue(triggerAppointment.appointmentStatus)
          calendarId = calendarId || getStringValue(triggerAppointment.calendarId) || getStringValue(triggerAppointment.calendar_id)
        }
      }

      // PRIORITY 4: Check customData (workflow payload structure - merge fields may be here)
      if (body.customData && typeof body.customData === 'object' && !Array.isArray(body.customData)) {
        const customData = body.customData as Record<string, unknown>
        appointmentId = appointmentId || getStringValue(customData.appointmentId) || getStringValue(customData.appointment_id) || getStringValue(customData.id)
        startTime = startTime || getStringValue(customData.startTime) || getStringValue(customData.start_time) || getStringValue(customData.scheduledAt)
        endTime = endTime || getStringValue(customData.endTime) || getStringValue(customData.end_time)
        appointmentStatus = appointmentStatus || getStringValue(customData.appointmentStatus) || getStringValue(customData.status) || getStringValue(customData.appointment_status)
        calendarId = calendarId || getStringValue(customData.calendarId) || getStringValue(customData.calendar_id)
        assignedUserId = assignedUserId || getStringValue(customData.assignedUserId) || getStringValue(customData.assigned_user_id) || getStringValue(customData.assignedUser)
        title = title || getStringValue(customData.title)
        notes = notes || getStringValue(customData.notes)
      }

      // PRIORITY 5: Check custom field names (company-specific fields as fallback)
      if (!appointmentId) {
        appointmentId = getStringValue(body['PCN - Appointment ID']) || getStringValue(body['Call Notes - Appointment ID'])
      }
      if (!startTime) {
        startTime = getStringValue(body['Appointment Date']) || getStringValue(body['Call Booked Date']) || getStringValue(body['Appointment Confirmed Date'])
      }
      
      // PRIORITY 6: Check body.calendar structure for appointmentId (GHL might nest it)
      if (!appointmentId && body.calendar && typeof body.calendar === 'object' && !Array.isArray(body.calendar)) {
        const calendar = body.calendar as Record<string, unknown>
        appointmentId = getStringValue(calendar.appointmentId) || getStringValue(calendar.id)
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
        appointmentStatus: appointmentData.appointmentStatus || getStringValue(body.appointmentStatus) || getStringValue(body.status),
        calendarId: appointmentData.calendarId,
        calendarName: appointmentData.calendarName,
        assignedUserId: appointmentData.assignedUserId,
        title: appointmentData.title || getStringValue(body.title),
        notes: appointmentData.notes || getStringValue(body.notes),
        locationId: getStringValue(body.locationId),
        contactId: getStringValue(body.contactId) || getStringValue(body.contact_id),
        // Parse dates to ISO strings for database storage
        startTimeParsed: appointmentData.startTime ? parseGHLDate(appointmentData.startTime) : null,
        endTimeParsed: appointmentData.endTime ? parseGHLDate(appointmentData.endTime) : null,
      }
    }
    // Check if data is in customData (GHL workflow format)
    else if (body.customData && typeof body.customData === 'object') {
      console.log('[GHL Webhook] Data found nested in body.customData')
      const customData = body.customData as Record<string, unknown>

      // Get location ID from various sources
      let locationId = getStringValue(customData.locationId) || getStringValue(body.locationId)
      if (!locationId && body.location && typeof body.location === 'object' && !Array.isArray(body.location)) {
        const location = body.location as Record<string, unknown>
        locationId = getStringValue(location.id)
      }

      // Merge customData with location from root level if available
      webhookData = {
        ...body.customData,
        locationId,
        contactId: getStringValue(customData.contactId) || getStringValue(body.contact_id),
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
        contactEmail: getStringValue(body.email),
        contactPhone: getStringValue(body.phone),
        contactName: getStringValue(body.full_name) || `${getStringValue(body.first_name)} ${getStringValue(body.last_name)}`.trim(),
        firstName: getStringValue(body.first_name),
        lastName: getStringValue(body.last_name),
        // Store all custom fields for attribution resolution
        allCustomFields: body
      }
    }
    // Check if data is nested in body.data
    else if (body.data && typeof body.data === 'object' && !Array.isArray(body.data)) {
      console.log('[GHL Webhook] Data found nested in body.data')
      const data = body.data as Record<string, unknown>

      // Get location ID from various sources
      let locationId = getStringValue(body.locationId) || getStringValue(data.locationId)
      if (!locationId && body.location && typeof body.location === 'object' && !Array.isArray(body.location)) {
        const location = body.location as Record<string, unknown>
        locationId = getStringValue(location.id)
      }

      webhookData = {
        ...body.data,
        locationId,
        // Merge extracted appointment data
        appointmentId: appointmentData.appointmentId || getStringValue(data.appointmentId),
        startTime: appointmentData.startTime || getStringValue(data.startTime),
        endTime: appointmentData.endTime || getStringValue(data.endTime),
        appointmentStatus: appointmentData.appointmentStatus || getStringValue(data.appointmentStatus),
        calendarId: appointmentData.calendarId || getStringValue(data.calendarId),
        calendarName: appointmentData.calendarName,
        assignedUserId: appointmentData.assignedUserId || getStringValue(data.assignedUserId),
      }
    }
    // Check if event is nested
    else if (body.event && typeof body.event === 'object' && !Array.isArray(body.event)) {
      console.log('[GHL Webhook] Data found nested in body.event')
      const event = body.event as Record<string, unknown>

      // Get location ID from various sources
      let locationId = getStringValue(body.locationId) || getStringValue(event.locationId)
      if (!locationId && body.location && typeof body.location === 'object' && !Array.isArray(body.location)) {
        const location = body.location as Record<string, unknown>
        locationId = getStringValue(location.id)
      }

      webhookData = {
        ...body.event,
        locationId,
        // Merge extracted appointment data
        appointmentId: appointmentData.appointmentId || getStringValue(event.appointmentId),
        startTime: appointmentData.startTime || getStringValue(event.startTime),
        endTime: appointmentData.endTime || getStringValue(event.endTime),
        appointmentStatus: appointmentData.appointmentStatus || getStringValue(event.appointmentStatus),
        calendarId: appointmentData.calendarId || getStringValue(event.calendarId),
        calendarName: appointmentData.calendarName,
        assignedUserId: appointmentData.assignedUserId || getStringValue(event.assignedUserId),
      }
    }
    // Check if location is at root and might need extraction (direct format)
    else {
      // Get location ID from body.location if it exists
      let locationId = getStringValue(body.locationId)
      if (!locationId && body.location && typeof body.location === 'object' && !Array.isArray(body.location)) {
        const location = body.location as Record<string, unknown>
        locationId = getStringValue(location.id)
      }

      // Only proceed if we have location or contact data
      if (locationId || getStringValue(body.contact_id)) {
        console.log('[GHL Webhook] Found location.id at root level - using direct format')
        webhookData = {
          ...body,
          locationId,
          // Merge extracted appointment data
          appointmentId: appointmentData.appointmentId,
          startTime: appointmentData.startTime,
          endTime: appointmentData.endTime,
          appointmentStatus: appointmentData.appointmentStatus,
          calendarId: appointmentData.calendarId,
          calendarName: appointmentData.calendarName,
          assignedUserId: appointmentData.assignedUserId,
          contactId: getStringValue(body.contact_id) || getStringValue(body.contactId),
          contactEmail: getStringValue(body.email),
          contactPhone: getStringValue(body.phone),
          contactName: getStringValue(body.full_name) || `${getStringValue(body.first_name)} ${getStringValue(body.last_name)}`.trim(),
        }
      }
    }
    
    console.log('[GHL Webhook] Extracted webhook data:', JSON.stringify(webhookData, null, 2))
    console.log('[GHL Webhook] Type:', webhookData.type, '| ID:', webhookData.id, '| AppointmentId:', webhookData.appointmentId, '| LocationId:', webhookData.locationId)

    // Type guard - check if this looks like our expected format
    const webhook = webhookData as GHLWebhookExtended
    
    // Check if this is an appointment webhook
    // Handle cases where type is in customData but appointment data might be sparse

    // Check workflow name safely
    let isWorkflowAppointment = false
    if (body.workflow && typeof body.workflow === 'object' && !Array.isArray(body.workflow)) {
      const workflow = body.workflow as Record<string, unknown>
      const workflowName = getStringValue(workflow.name).toLowerCase()
      isWorkflowAppointment = workflowName.includes('appointment') || workflowName.includes('webhook')
    }

    // Check customData type safely
    let isCustomDataAppointment = false
    if (body.customData && typeof body.customData === 'object' && !Array.isArray(body.customData)) {
      const customData = body.customData as Record<string, unknown>
      isCustomDataAppointment = getStringValue(customData.type) === 'Appointment'
    }

    const isAppointmentWebhook =
      webhook.type === 'Appointment' ||
      webhook.appointmentId ||
      webhook.appointmentStatus ||
      isCustomDataAppointment ||
      isWorkflowAppointment
    
    if (!isAppointmentWebhook) {
      // Get customData type safely for logging
      let customDataType = ''
      if (body.customData && typeof body.customData === 'object' && !Array.isArray(body.customData)) {
        const customData = body.customData as Record<string, unknown>
        customDataType = getStringValue(customData.type)
      }
      console.log('[GHL Webhook] Not an appointment webhook, ignoring. Type:', webhook.type, '| CustomData type:', customDataType)
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
      if (body.location && typeof body.location === 'object' && !Array.isArray(body.location)) {
        const location = body.location as Record<string, unknown>
        const locationId = getStringValue(location.id)
        if (locationId) {
          webhook.locationId = locationId
          console.log('[GHL Webhook] Extracted locationId from body.location.id:', webhook.locationId)
        } else {
          console.error('[GHL Webhook] Missing locationId in payload')
          return NextResponse.json({ error: 'Missing locationId' }, { status: 400 })
        }
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
            const sortedAppointments = appointments.sort((a: Record<string, unknown>, b: Record<string, unknown>) => {
              const dateA = new Date((a.startTime || a.scheduledAt || a.createdAt || 0) as string | number).getTime()
              const dateB = new Date((b.startTime || b.scheduledAt || b.createdAt || 0) as string | number).getTime()
              return dateB - dateA
            })

            const latestAppointment = sortedAppointments[0]
            console.log('[GHL Webhook] Found appointment via API:', latestAppointment.id)

            // Populate webhook data from API response
            webhook.appointmentId = (latestAppointment.id || latestAppointment.appointmentId) as string
            webhook.startTime = (latestAppointment.startTime || latestAppointment.scheduledAt || latestAppointment.start_time) as string
            webhook.endTime = (latestAppointment.endTime || latestAppointment.end_time) as string
            webhook.appointmentStatus = (latestAppointment.status || latestAppointment.appointmentStatus || 'scheduled') as string
            webhook.calendarId = (latestAppointment.calendarId || latestAppointment.calendar_id || '') as string
            webhook.assignedUserId = (latestAppointment.assignedUserId || latestAppointment.assigned_user_id || '') as string
            webhook.title = (latestAppointment.title || latestAppointment.name || '') as string
            webhook.notes = (latestAppointment.notes || latestAppointment.description || '') as string

            console.log('[GHL Webhook] Successfully populated appointment data from GHL API')
          } else {
            console.warn('[GHL Webhook] No appointments found for contact via API. Proceeding with contact sync only.')
          }
        } catch (apiError) {
          const errorMessage = apiError instanceof Error ? apiError.message : 'Unknown error'
          console.error('[GHL Webhook] Failed to fetch appointment from GHL API:', errorMessage)
          console.log('[GHL Webhook] Proceeding with contact sync only...')
        }
      }
      
      // If we still don't have appointmentId after API fetch, proceed with contact sync only
      if (!webhook.appointmentId && company && webhook.contactId) {
        // Sync/update contact with available data
        const tags = typeof body.tags === 'string' ? body.tags.split(',').map((t) => t.trim()) : []
        const contactData = {
          name: webhookData.contactName || getStringValue(body.full_name) || `${getStringValue(body.first_name)} ${getStringValue(body.last_name)}`.trim(),
          email: webhookData.contactEmail || getStringValue(body.email),
          phone: webhookData.contactPhone || getStringValue(body.phone),
          tags,
          customFields: JSON.parse(JSON.stringify(body)) // Store all custom fields for attribution, convert to plain object
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

  } catch (error) {
    console.error('[GHL Webhook] Error processing webhook:', error)
    if (error instanceof Error) {
      console.error('[GHL Webhook] Error stack:', error.stack)
      console.error('[GHL Webhook] Error details:', JSON.stringify(error, Object.getOwnPropertyNames(error)))
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ error: 'Unknown error occurred' }, { status: 500 })
  }
}