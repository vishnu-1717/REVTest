/**
 * Handle appointment cancelled webhook event
 */

import { GHLWebhook, GHLCompany } from '@/types'
import { withPrisma } from '@/lib/db'
import { parseGHLDate } from '@/lib/webhooks/utils'
import { recalculateContactInclusionFlags } from '@/lib/appointment-inclusion-flag'

export async function handleAppointmentCancelled(webhook: GHLWebhook, company: GHLCompany) {
  console.log('[GHL Webhook] handleAppointmentCancelled called with:', {
    appointmentId: webhook.appointmentId,
    contactId: webhook.contactId,
    companyId: company.id
  })

  await withPrisma(async (prisma) => {
    // First, try to find existing appointment
    let appointment = await prisma.appointment.findFirst({
      where: { ghlAppointmentId: webhook.appointmentId }
    })

    if (appointment) {
      // Update existing appointment to cancelled status
      console.log('[GHL Webhook] Found existing appointment, updating to cancelled:', appointment.id)

      await prisma.appointment.update({
        where: { id: appointment.id },
        data: {
          status: 'cancelled',
          outcome: 'Cancelled' // Set outcome for consistency with PCN data
        }
      })

      console.log('[GHL Webhook] ✅ Appointment cancelled:', appointment.id)

      // Recalculate inclusion flags for this contact
      try {
        await recalculateContactInclusionFlags(appointment.contactId, appointment.companyId)
        console.log('[GHL Webhook] ✅ Recalculated inclusion flags for contact')
      } catch (flagError: any) {
        console.error('[GHL Webhook] Error calculating inclusion flag after cancellation:', flagError)
      }
    } else {
      // Appointment doesn't exist yet - create it with cancelled status
      // This can happen if the cancellation webhook arrives before the creation webhook
      console.log('[GHL Webhook] Appointment not found, creating with cancelled status')

      if (!webhook.contactId) {
        console.warn('[GHL Webhook] Cannot create cancelled appointment: missing contactId')
        return
      }

      // Find or create contact
      let contact = await prisma.contact.findFirst({
        where: {
          companyId: company.id,
          ghlContactId: webhook.contactId
        }
      })

      if (!contact && webhook.contactId) {
        const firstName = (webhook as any).firstName || ''
        const lastName = (webhook as any).lastName || ''
        const fullName = (webhook as any).contactName || `${firstName} ${lastName}`.trim() || 'Unknown'

        contact = await prisma.contact.create({
          data: {
            companyId: company.id,
            ghlContactId: webhook.contactId,
            name: fullName,
            email: (webhook as any).contactEmail,
            phone: (webhook as any).contactPhone,
            tags: [],
            customFields: (webhook as any).allCustomFields || {}
          }
        })
        console.log('[GHL Webhook] Created contact for cancelled appointment:', contact.id)
      }

      if (!contact) {
        console.error('[GHL Webhook] Could not create contact for cancelled appointment')
        return
      }

      // Parse scheduled time from webhook
      const startTimeDate = parseGHLDate(webhook.startTime) || new Date()
      const endTimeDate = webhook.endTime ? parseGHLDate(webhook.endTime) : null

      // Find calendar if provided
      let calendar: any = null
      if (webhook.calendarId) {
        calendar = await prisma.calendar.findFirst({
          where: {
            companyId: company.id,
            ghlCalendarId: webhook.calendarId
          }
        })
      }

      // Create appointment with cancelled status
      appointment = await prisma.appointment.create({
        data: {
          companyId: company.id,
          contactId: contact.id,
          ghlAppointmentId: webhook.appointmentId,
          scheduledAt: startTimeDate,
          startTime: startTimeDate,
          endTime: endTimeDate,
          calendarId: calendar?.id,
          status: 'cancelled',
          outcome: 'Cancelled',
          pcnSubmitted: false,
          notes: webhook.notes || (webhook as any).title,
          customFields: webhook.customFields || {}
        }
      })

      console.log('[GHL Webhook] ✅ Created cancelled appointment:', appointment.id)

      // Recalculate inclusion flags for this contact
      try {
        await recalculateContactInclusionFlags(contact.id, company.id)
        console.log('[GHL Webhook] ✅ Recalculated inclusion flags for contact')
      } catch (flagError: any) {
        console.error('[GHL Webhook] Error calculating inclusion flag after cancellation:', flagError)
      }
    }
  })
}
