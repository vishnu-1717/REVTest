/**
 * Handle appointment rescheduled webhook event
 */

import { GHLWebhook, GHLCompany } from '@/types'
import { withPrisma } from '@/lib/db'
import { parseGHLDate } from '@/lib/webhooks/utils'
import { recalculateContactInclusionFlags } from '@/lib/appointment-inclusion-flag'
import { handleAppointmentCreated } from './appointment-created'

export async function handleAppointmentRescheduled(webhook: GHLWebhook, company: GHLCompany) {
  await withPrisma(async (prisma) => {
    const existing = await prisma.appointment.findFirst({
    where: { ghlAppointmentId: webhook.appointmentId }
  })

  if (!existing) {
    // Treat as new appointment
    await handleAppointmentCreated(webhook, company)
    return
  }

  // Parse dates from webhook
  const startTimeDate = (webhook as any).startTimeParsed || parseGHLDate(webhook.startTime) || new Date(webhook.startTime || Date.now())
  const endTimeDate = (webhook as any).endTimeParsed || parseGHLDate(webhook.endTime) || null

  // Update existing appointment
  await prisma.appointment.update({
    where: { id: existing.id },
    data: {
      scheduledAt: startTimeDate,
      startTime: startTimeDate,
      endTime: endTimeDate,
      status: 'scheduled',
      notes: webhook.notes || (webhook as any).title || existing.notes,
      customFields: {
          ...(existing.customFields as Record<string, any> || {}),
        rescheduledCount: ((existing.customFields as any)?.rescheduledCount || 0) + 1
      }
    }
    })

    // Recalculate inclusion flags for this contact (rescheduling affects ordering)
    try {
      await recalculateContactInclusionFlags(existing.contactId, existing.companyId)
    } catch (flagError: any) {
      console.error('[GHL Webhook] Error calculating inclusion flag after reschedule:', flagError)
    }
  })
}
