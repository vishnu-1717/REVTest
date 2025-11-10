/**
 * Handle appointment rescheduled webhook event
 */

import { GHLWebhookExtended, GHLCompany } from '@/types'
import { withPrisma } from '@/lib/db'
import { parseGHLDate } from '@/lib/webhooks/utils'
import { recalculateContactInclusionFlags } from '@/lib/appointment-inclusion-flag'
import { handleAppointmentCreated } from './appointment-created'

export async function handleAppointmentRescheduled(webhook: GHLWebhookExtended, company: GHLCompany) {
  await withPrisma(async (prisma) => {
    const timezone = company.timezone || 'UTC'
    const existing = await prisma.appointment.findFirst({
    where: { ghlAppointmentId: webhook.appointmentId }
  })

  if (!existing) {
    // Treat as new appointment
    await handleAppointmentCreated(webhook, company)
    return
  }

  // Parse dates from webhook
  const startTimeDate =
    webhook.startTimeParsed ||
    parseGHLDate(webhook.startTime, timezone) ||
    (webhook.startTime ? parseGHLDate(webhook.startTime, 'UTC') : null) ||
    new Date(webhook.startTime || Date.now())
  const endTimeDate =
    webhook.endTimeParsed ||
    (webhook.endTime ? parseGHLDate(webhook.endTime, timezone) : null)

  // Update existing appointment
  const existingCustomFields = (existing.customFields as Record<string, unknown>) || {}
  const rescheduledCount = (typeof existingCustomFields.rescheduledCount === 'number' ? existingCustomFields.rescheduledCount : 0) + 1

  await prisma.appointment.update({
    where: { id: existing.id },
    data: {
      scheduledAt: startTimeDate,
      startTime: startTimeDate,
      endTime: endTimeDate,
      status: 'scheduled',
      notes: webhook.notes || webhook.title || existing.notes,
      customFields: JSON.parse(JSON.stringify({
          ...existingCustomFields,
        rescheduledCount
      }))
    }
    })

    // Recalculate inclusion flags for this contact (rescheduling affects ordering)
    try {
      await recalculateContactInclusionFlags(existing.contactId, existing.companyId)
    } catch (flagError) {
      console.error('[GHL Webhook] Error calculating inclusion flag after reschedule:', flagError)
    }
  })
}
