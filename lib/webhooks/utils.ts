/**
 * Shared webhook utility functions
 */

import { GHLWebhook, GHLWebhookPayload } from '@/types'
import { localDateTimeStringToUtc, convertDateToUtc } from '@/lib/timezone'

const isoWithTimezoneRegex = /([zZ]|[+-]\d{2}:?\d{2})$/

/**
 * Parse GHL date format: "Thu, Oct 30th, 2025 | 2:00 pm" or ISO 8601 format
 */
export function parseGHLDate(dateString: string | null | undefined, timezone: string = 'UTC'): Date | null {
  if (!dateString || typeof dateString !== 'string') return null

  const trimmed = dateString.trim()
  if (!trimmed) return null

  if (isoWithTimezoneRegex.test(trimmed)) {
    const isoDate = new Date(trimmed)
    return isNaN(isoDate.getTime()) ? null : isoDate
  }

  // Handle ISO-like strings without timezone info (treat as local to company)
  const normalized = trimmed.replace(' ', 'T')
  const isoMatch = normalized.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?)?$/)
  if (isoMatch) {
    const [, y, m, d, hh = '00', mm = '00', ss = '00', fractional = '000'] = isoMatch
    const millis = fractional.padEnd(3, '0').slice(0, 3)
    return localDateTimeStringToUtc(`${y}-${m}-${d}T${hh}:${mm}:${ss}.${millis}`, timezone)
  }

  // Try parsing GHL format: "Thu, Oct 30th, 2025 | 2:00 pm"
  // Pattern: Day, Month Day(th), Year | Hour:Minute am/pm
  try {
    // Extract the date and time parts
    const parts = trimmed.split(' | ')
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

            const iso = `${year}-${(monthIndex + 1).toString().padStart(2, '0')}-${parseInt(day).toString().padStart(2, '0')}T${hour24.toString().padStart(2, '0')}:${parseInt(minutes).toString().padStart(2, '0')}:00.000`
            return localDateTimeStringToUtc(iso, timezone)
          }
        }
      }
    }

    // Fallback: try native Date parsing
    const fallbackDate = new Date(trimmed)
    if (!isNaN(fallbackDate.getTime())) {
      return convertDateToUtc(new Date(Date.UTC(
        fallbackDate.getFullYear(),
        fallbackDate.getMonth(),
        fallbackDate.getDate(),
        fallbackDate.getHours(),
        fallbackDate.getMinutes(),
        fallbackDate.getSeconds(),
        fallbackDate.getMilliseconds()
      )), timezone)
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
