/**
 * Shared webhook utility functions
 */

import { GHLWebhook, GHLWebhookPayload } from '@/types'

/**
 * Parse GHL date format: "Thu, Oct 30th, 2025 | 2:00 pm" or ISO 8601 format
 */
export function parseGHLDate(dateString: string | null | undefined): Date | null {
  if (!dateString || typeof dateString !== 'string') return null

  // Try ISO 8601 format first (e.g., "2025-10-30T14:00:00.000Z")
  const isoDate = new Date(dateString)
  if (!isNaN(isoDate.getTime())) {
    return isoDate
  }

  // Try parsing GHL format: "Thu, Oct 30th, 2025 | 2:00 pm"
  // Pattern: Day, Month Day(th), Year | Hour:Minute am/pm
  try {
    // Extract the date and time parts
    const parts = dateString.split(' | ')
    if (parts.length === 2) {
      const datePart = parts[0].trim() // "Thu, Oct 30th, 2025"
      const timePart = parts[1].trim() // "2:00 pm"

      // Parse date: "Thu, Oct 30th, 2025" -> "Oct 30, 2025"
      const dateMatch = datePart.match(/(\w+),?\s+(\w+)\s+(\d+)(?:th|st|nd|rd)?,?\s+(\d{4})/)
      if (dateMatch) {
        const [, , month, day, year] = dateMatch
        const monthIndex = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].indexOf(month)
        if (monthIndex !== -1) {
          // Parse time: "2:00 pm"
          const timeMatch = timePart.match(/(\d{1,2}):(\d{2})\s*(am|pm)/i)
          if (timeMatch) {
            let [, hours, minutes, ampm] = timeMatch
            let hour24 = parseInt(hours)
            if (ampm.toLowerCase() === 'pm' && hour24 !== 12) hour24 += 12
            if (ampm.toLowerCase() === 'am' && hour24 === 12) hour24 = 0

            const date = new Date(parseInt(year), monthIndex, parseInt(day), hour24, parseInt(minutes))
            if (!isNaN(date.getTime())) {
              return date
            }
          }
        }
      }
    }

    // Fallback: try native Date parsing
    const fallbackDate = new Date(dateString)
    if (!isNaN(fallbackDate.getTime())) {
      return fallbackDate
    }
  } catch (error) {
    console.warn('[GHL Webhook] Failed to parse date:', dateString, error)
  }

  return null
}

/**
 * Normalize and validate webhook payload
 */
export function normalizeWebhookPayload(body: GHLWebhookPayload): GHLWebhook | null {
  // Handle different GHL payload structures
  let webhook: GHLWebhook

  // Try direct payload
  if (body.type === 'Appointment' || body.customData?.type === 'Appointment') {
    webhook = body as unknown as GHLWebhook
  } else {
    console.log('[GHL Webhook] Unrecognized payload structure')
    return null
  }

  return webhook
}

/**
 * Validate that webhook has minimum required fields
 */
export function validateWebhook(webhook: GHLWebhook): boolean {
  if (!webhook.type) {
    console.error('[GHL Webhook] Missing webhook type')
    return false
  }

  if (!webhook.locationId) {
    console.error('[GHL Webhook] Missing locationId')
    return false
  }

  return true
}

/**
 * Log webhook event with structured formatting
 */
export function logWebhookEvent(event: string, data: Record<string, unknown>): void {
  console.log(`[GHL Webhook] ${event}:`, JSON.stringify(data, null, 2))
}
