/**
 * Fix appointment scheduledAt dates by extracting correct dates from stored webhook events
 * 
 * This script looks at all GHL webhook events we've received and extracts the correct
 * startTime from calendar.startTime in the payload, then updates appointments accordingly.
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

interface WebhookAppointmentData {
  webhookEventId: string
  appointmentId: string | null
  ghlAppointmentId: string | null
  calendarStartTime: string | null
  calendarEndTime: string | null
  webhookCreatedAt: Date
  payload: any
}

function getStringValue(value: unknown): string | null {
  if (value === null || value === undefined) return null
  const str = String(value).trim()
  return str.length ? str : null
}

function extractAppointmentDataFromPayload(payload: any): {
  appointmentId: string | null
  ghlAppointmentId: string | null
  calendarStartTime: string | null
  calendarEndTime: string | null
} {
  let appointmentId: string | null = null
  let ghlAppointmentId: string | null = null
  let calendarStartTime: string | null = null
  let calendarEndTime: string | null = null

  if (!payload || typeof payload !== 'object') {
    return { appointmentId, ghlAppointmentId, calendarStartTime, calendarEndTime }
  }

  // Check root level
  appointmentId = getStringValue(payload.id) || getStringValue(payload.appointmentId) || getStringValue(payload.appointment_id)
  ghlAppointmentId = ghlAppointmentId || appointmentId

  // PRIORITY 1: Check calendar.startTime (this is where GHL sends the actual appointment time)
  if (payload.calendar && typeof payload.calendar === 'object' && !Array.isArray(payload.calendar)) {
    const calendar = payload.calendar as Record<string, unknown>
    calendarStartTime = getStringValue(calendar.startTime) || getStringValue(calendar.start_time)
    calendarEndTime = getStringValue(calendar.endTime) || getStringValue(calendar.end_time)
    ghlAppointmentId = ghlAppointmentId || getStringValue(calendar.appointmentId) || getStringValue(calendar.id)
  }

  // PRIORITY 2: Check root level startTime
  if (!calendarStartTime) {
    calendarStartTime = getStringValue(payload.startTime) || getStringValue(payload.start_time) || getStringValue(payload.scheduledAt)
    calendarEndTime = calendarEndTime || getStringValue(payload.endTime) || getStringValue(payload.end_time)
  }

  // PRIORITY 3: Check appointment object
  if (!calendarStartTime && payload.appointment && typeof payload.appointment === 'object' && !Array.isArray(payload.appointment)) {
    const appointment = payload.appointment as Record<string, unknown>
    calendarStartTime = getStringValue(appointment.startTime) || getStringValue(appointment.start_time) || getStringValue(appointment.scheduledAt)
    calendarEndTime = calendarEndTime || getStringValue(appointment.endTime) || getStringValue(appointment.end_time)
    ghlAppointmentId = ghlAppointmentId || getStringValue(appointment.id) || getStringValue(appointment.appointmentId)
  }

  // PRIORITY 4: Check triggerData
  if (!calendarStartTime && payload.triggerData && typeof payload.triggerData === 'object' && !Array.isArray(payload.triggerData)) {
    const triggerData = payload.triggerData as Record<string, unknown>
    if (triggerData.appointment && typeof triggerData.appointment === 'object' && !Array.isArray(triggerData.appointment)) {
      const triggerAppointment = triggerData.appointment as Record<string, unknown>
      calendarStartTime = getStringValue(triggerAppointment.startTime) || getStringValue(triggerAppointment.start_time)
      calendarEndTime = calendarEndTime || getStringValue(triggerAppointment.endTime) || getStringValue(triggerAppointment.end_time)
      ghlAppointmentId = ghlAppointmentId || getStringValue(triggerAppointment.id) || getStringValue(triggerAppointment.appointmentId)
    }
  }

  // PRIORITY 5: Check customData
  if (!calendarStartTime && payload.customData && typeof payload.customData === 'object' && !Array.isArray(payload.customData)) {
    const customData = payload.customData as Record<string, unknown>
    calendarStartTime = getStringValue(customData.startTime) || getStringValue(customData.start_time) || getStringValue(customData.scheduledAt)
    calendarEndTime = calendarEndTime || getStringValue(customData.endTime) || getStringValue(customData.end_time)
    ghlAppointmentId = ghlAppointmentId || getStringValue(customData.appointmentId) || getStringValue(customData.appointment_id) || getStringValue(customData.id)
  }

  return { appointmentId, ghlAppointmentId, calendarStartTime, calendarEndTime }
}

async function extractAppointmentDataFromWebhooks(): Promise<Map<string, WebhookAppointmentData>> {
  console.log('🔍 Extracting appointment data from webhook events...\n')

  // Find all GHL webhook events that might contain appointment data
  // Note: GHL appointment webhooks are typically not stored, but PCN webhooks might have appointment data
  const webhookEvents = await prisma.webhookEvent.findMany({
    where: {
      processor: 'ghl',
      // Check all GHL webhook events - some might contain appointment data in payload
      payload: {
        path: ['calendar'],
        not: null
      }
    },
    orderBy: {
      createdAt: 'desc'
    },
    take: 10000 // Process up to 10k webhook events
  })

  // Also check webhook events that might have appointment data in different structures
  const allWebhookEvents = await prisma.webhookEvent.findMany({
    where: {
      processor: 'ghl',
      OR: [
        { eventType: { contains: 'appointment', mode: 'insensitive' } },
        { eventType: { contains: 'booking', mode: 'insensitive' } },
        { eventType: { contains: 'pcn', mode: 'insensitive' } }, // PCN webhooks might have appointment data
      ]
    },
    orderBy: {
      createdAt: 'desc'
    },
    take: 10000
  })

  // Combine and deduplicate
  const eventMap = new Map<string, typeof allWebhookEvents[0]>()
  for (const event of [...webhookEvents, ...allWebhookEvents]) {
    if (!eventMap.has(event.id)) {
      eventMap.set(event.id, event)
    }
  }

  const uniqueEvents = Array.from(eventMap.values())
  console.log(`Found ${uniqueEvents.length} GHL webhook events to check\n`)

  // Map: ghlAppointmentId -> WebhookAppointmentData (keep the most recent one)
  const appointmentDataMap = new Map<string, WebhookAppointmentData>()

  for (const event of uniqueEvents) {
    try {
      const payload = event.payload as any
      const extracted = extractAppointmentDataFromPayload(payload)

      // Only process if we have both ghlAppointmentId and calendarStartTime
      if (extracted.ghlAppointmentId && extracted.calendarStartTime) {
        const existing = appointmentDataMap.get(extracted.ghlAppointmentId)

        // Keep the most recent webhook event for each appointment
        if (!existing || event.createdAt > existing.webhookCreatedAt) {
          appointmentDataMap.set(extracted.ghlAppointmentId, {
            webhookEventId: event.id,
            appointmentId: extracted.appointmentId,
            ghlAppointmentId: extracted.ghlAppointmentId,
            calendarStartTime: extracted.calendarStartTime,
            calendarEndTime: extracted.calendarEndTime,
            webhookCreatedAt: event.createdAt,
            payload: payload
          })
        }
      }
    } catch (error: any) {
      // Silently skip - not all webhooks will have appointment data
    }
  }

  console.log(`Extracted appointment data for ${appointmentDataMap.size} unique appointments from webhooks\n`)
  return appointmentDataMap
}

async function fixAppointmentsFromWebhooks() {
  try {
    // Step 1: Extract appointment data from webhooks
    const appointmentDataMap = await extractAppointmentDataFromWebhooks()

    console.log(`Found appointment data in ${appointmentDataMap.size} webhook events\n`)

    // If we don't have enough webhook data, we'll need to fetch from GHL API
    // But first, let's see what we can fix from webhooks

    // Step 2: Find matching appointments in database
    console.log('🔍 Finding matching appointments in database...\n')

    const ghlAppointmentIds = Array.from(appointmentDataMap.keys())
    const appointments = await prisma.appointment.findMany({
      where: {
        ghlAppointmentId: { in: ghlAppointmentIds }
      },
      select: {
        id: true,
        ghlAppointmentId: true,
        scheduledAt: true,
        startTime: true,
        endTime: true,
        contact: {
          select: {
            name: true
          }
        },
        company: {
          select: {
            name: true
          }
        }
      }
    })

    console.log(`Found ${appointments.length} matching appointments in database\n`)

    // Step 3: Compare and update appointments
    console.log('🔧 Comparing and updating appointments...\n')

    let fixed = 0
    let skipped = 0
    let errors = 0
    const updates: Array<{
      appointmentId: string
      contactName: string
      companyName: string
      oldScheduledAt: Date
      newScheduledAt: Date
      difference: number
    }> = []

    for (const appointment of appointments) {
      if (!appointment.ghlAppointmentId) continue

      const webhookData = appointmentDataMap.get(appointment.ghlAppointmentId)
      if (!webhookData || !webhookData.calendarStartTime) {
        skipped++
        continue
      }

      try {
        // Parse the startTime from webhook
        const correctScheduledAt = new Date(webhookData.calendarStartTime)
        const currentScheduledAt = appointment.scheduledAt

        // Check if date is valid
        if (isNaN(correctScheduledAt.getTime())) {
          console.warn(`  ⚠️  Invalid date for appointment ${appointment.id}: ${webhookData.calendarStartTime}`)
          skipped++
          continue
        }

        // Calculate time difference
        const timeDiff = Math.abs(correctScheduledAt.getTime() - currentScheduledAt.getTime())
        const hoursDiff = timeDiff / (1000 * 60 * 60)

        // Only update if difference is more than 1 hour (to avoid timezone rounding issues)
        if (hoursDiff < 1) {
          skipped++
          continue
        }

        // Parse endTime if available
        let correctEndTime: Date | null = null
        if (webhookData.calendarEndTime) {
          correctEndTime = new Date(webhookData.calendarEndTime)
          if (isNaN(correctEndTime.getTime())) {
            correctEndTime = null
          }
        }

        // Update appointment
        await prisma.appointment.update({
          where: { id: appointment.id },
          data: {
            scheduledAt: correctScheduledAt,
            startTime: correctScheduledAt,
            endTime: correctEndTime || appointment.endTime
          }
        })

        updates.push({
          appointmentId: appointment.id,
          contactName: appointment.contact.name,
          companyName: appointment.company.name,
          oldScheduledAt: currentScheduledAt,
          newScheduledAt: correctScheduledAt,
          difference: hoursDiff
        })

        fixed++
      } catch (error: any) {
        console.error(`  ❌ Error updating appointment ${appointment.id}: ${error.message}`)
        errors++
      }
    }

    // Step 4: Display results
    console.log('='.repeat(80))
    console.log('📊 Summary:')
    console.log(`   Fixed: ${fixed}`)
    console.log(`   Skipped: ${skipped}`)
    console.log(`   Errors: ${errors}`)
    console.log(`   Total processed: ${appointments.length}`)
    console.log('='.repeat(80))

    if (updates.length > 0) {
      console.log('\n📋 Updated Appointments (showing top 20 by time difference):\n')
      updates
        .sort((a, b) => b.difference - a.difference)
        .slice(0, 20)
        .forEach((update, index) => {
          console.log(`${index + 1}. ${update.contactName} (${update.companyName})`)
          console.log(`   Appointment ID: ${update.appointmentId}`)
          console.log(`   Old scheduledAt: ${update.oldScheduledAt.toISOString()}`)
          console.log(`   New scheduledAt: ${update.newScheduledAt.toISOString()}`)
          console.log(`   Difference: ${update.difference.toFixed(2)} hours`)
          console.log('')
        })

      if (updates.length > 20) {
        console.log(`   ... and ${updates.length - 20} more appointments\n`)
      }
    }
  } catch (error: any) {
    console.error('❌ Fatal error:', error)
    throw error
  } finally {
    await prisma.$disconnect()
  }
}

// Run the script
fixAppointmentsFromWebhooks()
  .then(() => {
    console.log('\n✅ Script completed successfully')
    process.exit(0)
  })
  .catch((error) => {
    console.error('\n❌ Script failed:', error)
    process.exit(1)
  })

