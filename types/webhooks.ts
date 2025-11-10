/**
 * GHL Webhook type definitions
 */

export interface GHLWebhook {
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

  customFields?: Record<string, unknown>
}

export interface GHLWebhookPayload {
  type?: string
  customData?: {
    type?: string
    [key: string]: unknown
  }
  [key: string]: unknown
}

export interface GHLCompany {
  id: string
  name: string
  ghlApiKey: string | null
  ghlLocationId: string | null
  attributionStrategy: string
  attributionSourceField: string | null
  useCalendarsForAttribution: boolean
}
