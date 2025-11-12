// types/pcn.ts
// TypeScript types for Post Call Notes (PCN) system

export type CallOutcome = 
  | 'showed' 
  | 'no_show' 
  | 'signed' 
  | 'contract_sent' 
  | 'cancelled'

export type FirstCallOrFollowUp = 'first_call' | 'follow_up'

export type NurtureType = 
  | 'not_qualified_yet'
  | 'thinking_it_over'
  | 'timing'
  | 'budget'
  | 'other'

export type QualificationStatus = 
  | 'qualified'
  | 'disqualified'
  | 'pending'

// PCN Submission payload
export interface PCNSubmission {
  // Required for all outcomes
  callOutcome: CallOutcome
  
  // For "showed" outcome
  firstCallOrFollowUp?: FirstCallOrFollowUp
  wasOfferMade?: boolean
  
  // If didn't move forward
  whyDidntMoveForward?: string
  notMovingForwardNotes?: string
  objectionType?: string
  objectionNotes?: string
  
  // Follow-up scheduling
  followUpScheduled?: boolean
  followUpDate?: string
  nurtureType?: NurtureType
  
  // Qualification
  qualificationStatus?: QualificationStatus
  disqualificationReason?: string
  
  // For "signed" outcome
  signedNotes?: string
  cashCollected?: number
  
  // For "no_show" outcome
  noShowCommunicative?: boolean
  noShowCommunicativeNotes?: string
  
  // For "cancelled" outcome
  cancellationReason?: string
  cancellationNotes?: string
  
  // General notes
  notes?: string
}

// Appointment data for PCN form (pre-filled)
export interface PCNAppointmentData {
  id: string
  scheduledAt: string
  contactName: string
  contactEmail: string | null
  contactPhone: string | null
  closerName: string | null
  calendarName: string | null
  status: string
  
  // Existing PCN data (if editing)
  pcnSubmitted: boolean
  pcnSubmittedAt: string | null
  outcome: string | null
  firstCallOrFollowUp: string | null
  wasOfferMade: boolean | null
  whyDidntMoveForward: string | null
  notMovingForwardNotes: string | null
  objectionType: string | null
  objectionNotes: string | null
  followUpScheduled: boolean
  followUpDate: string | null
  nurtureType: string | null
  qualificationStatus: string | null
  disqualificationReason: string | null
  signedNotes: string | null
  cashCollected: number | null
  noShowCommunicative: boolean | null
  noShowCommunicativeNotes: string | null
  cancellationReason: string | null
  cancellationNotes: string | null
  notes: string | null
}

// API Response types
export interface PCNSubmissionResponse {
  success: boolean
  appointment: {
    id: string
    status: string
    outcome: string | null
    pcnSubmitted: boolean
  }
}

export interface PendingPCN {
  id: string
  scheduledAt: string
  contactName: string
  closerId: string | null
  closerName: string | null
  status: string
  minutesSinceScheduled: number
  urgencyLevel: 'normal' | 'medium' | 'high'
}

export interface PendingPCNCloserSummary {
  closerId: string | null
  closerName: string
  pendingCount: number
  oldestMinutes: number | null
  urgencyLevel: 'normal' | 'medium' | 'high'
}

export interface PendingPCNsResponse {
  count: number
  totalCount?: number
  appointments: PendingPCN[]
  timezone?: string
  byCloser?: PendingPCNCloserSummary[]
}

export interface UpcomingAppointment {
  id: string
  scheduledAt: string
  contactName: string
  closerId: string | null
  closerName: string | null
  calendarId: string | null
  calendarName: string
  timezone?: string
}

export interface UpcomingAppointmentsResponse {
  appointments: UpcomingAppointment[]
  totalCount: number
  timezone?: string
  closers?: Array<{ id: string; name: string }>
  calendars?: Array<{ key: string; label: string }>
}

export interface CompletedPCN {
  id: string
  scheduledAt: string
  pcnSubmittedAt: string | null
  contactName: string
  closerId: string | null
  closerName: string
  status: string
  outcome: string | null
  cashCollected: number | null
  notes: string | null
}

export interface CompletedPCNsResponse {
  appointments: CompletedPCN[]
  totalCount: number
  timezone?: string
  closers?: Array<{ id: string; name: string }>
}

// Option lists for dropdowns
export const PCN_OPTIONS = {
  whyDidntMoveForward: [
    'Price objection',
    'Need to think about it',
    'Timing not right',
    'Need to discuss with partner/spouse',
    'Budget concerns',
    'Comparing options',
    'Technical concerns',
    'Other'
  ],
  
  objectionTypes: [
    'Price',
    'Timing',
    'Authority (needs approval)',
    'Trust',
    'Competition',
    'Technical fit',
    'Other'
  ],
  
  nurtureTypes: [
    'Not qualified yet',
    'Thinking it over',
    'Timing issue',
    'Budget not ready',
    'Waiting on decision maker',
    'Other'
  ],
  
  cancellationReasons: [
    'Prospect initiated',
    'No longer interested',
    'Found alternative solution',
    'Budget changed',
    'Timing changed',
    'No response to reschedule attempts',
    'Duplicate booking',
    'Other'
  ],
  
  disqualificationReasons: [
    'Not qualified (budget)',
    'Not qualified (authority)',
    'Not qualified (need)',
    'Not qualified (timing)',
    'Wrong fit for service',
    'Competitor/existing solution',
    'Tire kicker',
    'Other'
  ]
}

