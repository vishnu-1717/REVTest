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

export type PaymentPlanOrPIF = 'payment_plan' | 'pif'

export type QualificationStatus = 
  | 'qualified_to_purchase'
  | 'downsell_opportunity'
  | 'disqualified'

export type WhyNoOffer = 
  | 'Not a decision maker'
  | 'Budget'
  | 'Timeline'

export type NoShowCommunicative = 
  | 'communicative_up_to_call'
  | 'communicative_rescheduled'
  | 'not_communicative'

// PCN Submission payload
export interface PCNSubmission {
  // Required for all outcomes
  callOutcome: CallOutcome
  
  // For "signed" outcome
  paymentPlanOrPIF?: PaymentPlanOrPIF
  totalPrice?: number // Total revenue for payment plans
  numberOfPayments?: number // How many payments
  signedNotes?: string
  cashCollected?: number
  
  // For "showed" outcome
  firstCallOrFollowUp?: FirstCallOrFollowUp
  wasOfferMade?: boolean
  
  // Qualification status
  qualificationStatus?: QualificationStatus
  downsellOpportunity?: string // Company-configurable downsell options
  
  // If offer made but didn't move forward
  whyDidntMoveForward?: string // "Cash On Hand", "Partner Objection", "Fear/Uncertainty"
  notMovingForwardNotes?: string
  objectionType?: string
  objectionNotes?: string
  
  // If offer NOT made
  whyNoOffer?: WhyNoOffer
  whyNoOfferNotes?: string
  
  // Disqualified
  disqualificationReason?: string
  
  // Follow-up scheduling
  followUpScheduled?: boolean
  followUpDate?: string // Deprecated - no longer required
  nurtureType?: string // Now accepts any string value (redzone, short_term, long_term, etc.)
  
  // For "no_show" outcome
  noShowCommunicative?: NoShowCommunicative
  noShowCommunicativeNotes?: string
  didCallAndText?: boolean // Optional tracking
  
  // For "cancelled" outcome
  cancellationReason?: string // Updated options from decision tree
  cancellationNotes?: string
  
  // For "rescheduled" outcome
  rescheduledTo?: string // ISO date string
  
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
  paymentPlanOrPIF: string | null
  totalPrice: number | null
  numberOfPayments: number | null
  downsellOpportunity: string | null
  whyNoOffer: string | null
  whyNoOfferNotes: string | null
  noShowCommunicative: string | null
  noShowCommunicativeNotes: string | null
  didCallAndText: boolean | null
  cancellationReason: string | null
  cancellationNotes: string | null
  rescheduledTo: string | null
  rescheduledFrom: string | null
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
  assignableClosers?: Array<{ id: string; name: string }>
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
  paymentPlanOrPIF: [
    'payment_plan',
    'pif'
  ] as const,
  
  whyDidntMoveForward: [
    'Cash On Hand',
    'Partner Objection',
    'Fear/Uncertainty',
    'Other'
  ],
  
  whyNoOffer: [
    'Not a decision maker',
    'Budget',
    'Timeline'
  ] as const,
  
  noShowCommunicative: [
    'communicative_up_to_call',
    'communicative_rescheduled',
    'not_communicative'
  ] as const,
  
  qualificationStatus: [
    'qualified_to_purchase',
    'downsell_opportunity',
    'disqualified'
  ] as const,
  
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
    'Red Zone',
    'Short Term Nurture',
    'Long Term Nurture',
    'Other'
  ],
  
  cancellationReasons: [
    'Scheduling Conflict',
    'Unresponsive',
    'Budget/Decision Maker',
    'Product Not Good Fit',
    'Other',
    'Lost Interest',
    'Self Cancellation'
  ],
  
  disqualificationReasons: [
    'Budget Constraint',
    'Authority Constraint',
    'Poor Fit',
    'Wrong Timing',
    'Other'
  ]
}

