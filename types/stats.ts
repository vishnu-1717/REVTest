/**
 * Stats and analytics type definitions
 */

import { Commission, Sale } from '@prisma/client'
import { AppointmentWithRelations } from './appointments'

export interface BaseStats {
  totalAppointments: number
  scheduled: number
  showed: number
  signed: number
  noShows: number
  showRate: number
  closeRate: number
  totalRevenue: number
}

export interface RepStats {
  id: string
  name: string
  email: string
  appointments: number
  revenue: number
  commissions: number
  showRate: number
  closeRate: number
}

export interface CompanyStatsResponse extends BaseStats {
  averageDealSize: number
  totalCommissions: number
  pendingCommissions: number
  releasedCommissions: number
  paidCommissions: number
  activeRepsCount: number
  topPerformer: RepStats | null
  repStats: RepStats[]
  recentAppointments: AppointmentWithRelations[]
  recentCommissions: CommissionWithSale[]
}

export interface RepStatsResponse extends BaseStats {
  totalCommissions: number
  pendingCommissions: number
  releasedCommissions: number
  paidCommissions: number
  followUpsNeeded: number
  redzoneFollowUps: number
  recentAppointments: AppointmentWithRelations[]
  recentCommissions: CommissionWithSale[]
}

export interface CommissionWithSale extends Commission {
  Sale: Sale
}

export interface LeaderboardEntry {
  id: string
  name: string
  email: string
  revenue: number
  commissions: number
  appointments: number
  signed: number
  showDetails: boolean
  isCurrentUser: boolean
  rank: number
}

export interface AnalyticsBreakdownItem {
  scheduled: number
  showed: number
  signed: number
  noShows?: number
  cancelled: number
  revenue: number
  showRate: string
  closeRate: string
  total?: number
  averageSalesCycleDays?: number | null
}

export interface CloserBreakdownItem extends AnalyticsBreakdownItem {
  closerId: string
  closerEmail: string
  closerName: string
}

export type AnalyticsBreakdown = Record<string, AnalyticsBreakdownItem>
export type CloserBreakdownAccumulator = Record<string, Omit<CloserBreakdownItem, 'showRate' | 'closeRate'>>

export interface AnalyticsResponse extends BaseStats {
  // Core metrics
  callsCreated: number
  scheduledCallsToDate: number
  cancelled: number
  cancellationRate: string
  expectedCalls: number
  callsShown: number
  noShowRate: string
  qualifiedCalls: number
  qualifiedRate: string
  missingPCNs: number
  averageSalesCycleDays: number | null
  salesCycleCount: number

  // Breakdowns
  byCloser: AnalyticsBreakdown
  byDayOfWeek: AnalyticsBreakdown
  byCalendar: AnalyticsBreakdown
  byObjection: AnalyticsBreakdown
  byTimeOfDay: AnalyticsBreakdown
  byTrafficSource: AnalyticsBreakdown
  byFirstCallVsFollowUp: AnalyticsBreakdown

  // Lists
  followUps: Array<{
    id: string
    scheduledAt: Date
    contact: { name: string; email?: string; phone?: string }
    closer: { name: string } | null
    status: string
    nurtureType: string | null
    followUpDate: Date | null
  }>

  objections: Array<{
    id: string
    scheduledAt: Date
    contact: { name: string; email?: string; phone?: string }
    closer: { name: string } | null
    objectionType: string | null
    objectionNotes: string | null
  }>
}

export interface MonthlyRepStats {
  [repId: string]: {
    revenue: number
    appointments: number
  }
}
