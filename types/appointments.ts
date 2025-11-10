/**
 * Appointment-related type definitions
 */

import { Appointment, Contact, User, Calendar } from '@prisma/client'

export interface AppointmentWithRelations extends Appointment {
  contact?: Contact | null
  closer?: User | null
  setter?: User | null
  calendarRelation?: Calendar | null
}

export interface AppointmentFilters {
  status?: string
  closerId?: string
  setterId?: string
  objectionType?: string
  appointmentType?: 'first_call' | 'follow_up'
  followUpNeeded?: boolean
  nurtureType?: string
  minDealSize?: number
  maxDealSize?: number
  calendar?: string
  trafficSource?: string
  dayOfWeek?: number
  timeOfDay?: 'morning' | 'afternoon' | 'evening' | 'night'
  dateFrom?: Date
  dateTo?: Date
}

export interface DateFilter {
  gte?: Date
  lte?: Date
}

export interface AppointmentWhereClause {
  companyId: string
  closerId?: string | { not: null }
  setterId?: string
  status?: string | { not: string } | { in: string[] } | { notIn: string[] }
  objectionType?: {
    contains: string
    mode: 'insensitive'
  }
  isFirstCall?: boolean
  followUpScheduled?: boolean
  nurtureType?: {
    contains: string
    mode: 'insensitive'
  }
  cashCollected?: {
    gte?: number
    lte?: number
  }
  calendar?: {
    contains: string
    mode: 'insensitive'
  }
  attributionSource?: {
    contains: string
    mode: 'insensitive'
  }
  scheduledAt?: DateFilter
  createdAt?: DateFilter
  OR?: Array<{ appointmentInclusionFlag: number | null }>
  AND?: Array<Record<string, unknown>>
}
