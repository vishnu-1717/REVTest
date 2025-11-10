/**
 * Handle appointment updated webhook event
 */

import { GHLWebhookExtended, GHLCompany } from '@/types'
import { withPrisma } from '@/lib/db'
import { parseGHLDate } from '@/lib/webhooks/utils'
import { recalculateContactInclusionFlags } from '@/lib/appointment-inclusion-flag'
import { handleAppointmentCreated } from './appointment-created'

export async function handleAppointmentUpdated(webhook: GHLWebhookExtended, company: GHLCompany) {
  await withPrisma(async (prisma) => {
    const appointment = await prisma.appointment.findFirst({
      where: {
        ghlAppointmentId: webhook.appointmentId,
        companyId: company.id
      }
    })

    if (!appointment) {
      console.warn('[GHL Webhook] Update requested but appointment not found, treating as new')
      console.warn('[GHL Webhook] This likely means the appointment was never created - creating it now')
      // Call handleAppointmentCreated to create the appointment
      await handleAppointmentCreated(webhook, company)
      return
    }

    // Parse dates from webhook
    const startTimeDate = webhook.startTimeParsed || (webhook.startTime ? parseGHLDate(webhook.startTime) : null)
    const endTimeDate = webhook.endTimeParsed || (webhook.endTime ? parseGHLDate(webhook.endTime) : null)

  await prisma.appointment.update({
    where: { id: appointment.id },
    data: {
        scheduledAt: startTimeDate || undefined,
        startTime: startTimeDate || undefined,
        endTime: endTimeDate || undefined,
        notes: webhook.notes || webhook.title || undefined,
      customFields: webhook.customFields ? JSON.parse(JSON.stringify(webhook.customFields)) : undefined
    }
    })

    // Recalculate inclusion flags if scheduledAt changed
    if (startTimeDate) {
      try {
        await recalculateContactInclusionFlags(appointment.contactId, appointment.companyId)
      } catch (flagError) {
        console.error('[GHL Webhook] Error calculating inclusion flag after update:', flagError)
      }
    }
  })
}
