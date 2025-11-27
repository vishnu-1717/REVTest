import { withPrisma } from './db'
import { PCNSubmission } from '@/types/pcn'
import { Prisma } from '@prisma/client'

export type PCNChangelogAction = 
  | 'created' 
  | 'updated' 
  | 'ai_generated' 
  | 'reviewed' 
  | 'approved' 
  | 'rejected'

export type PCNChangelogSource = 
  | 'manual' 
  | 'ai' 
  | 'slack' 
  | 'zoom' 
  | 'system'

export interface LogPCNChangeParams {
  appointmentId: string
  companyId: string
  action: PCNChangelogAction
  actorUserId?: string | null
  actorName?: string | null
  previousData?: PCNSubmission | null
  newData?: PCNSubmission | null
  changes?: Record<string, { old: any; new: any }>
  notes?: string | null
  source?: PCNChangelogSource
}

/**
 * Extract PCN data from appointment for changelog
 */
export function extractPCNDataFromAppointment(appointment: any): PCNSubmission {
  const pcn: PCNSubmission = {
    callOutcome: appointment.outcome || null
  }

  if (appointment.firstCallOrFollowUp) {
    pcn.firstCallOrFollowUp = appointment.firstCallOrFollowUp
  }
  if (appointment.qualificationStatus) {
    pcn.qualificationStatus = appointment.qualificationStatus as any
  }
  if (appointment.wasOfferMade !== null && appointment.wasOfferMade !== undefined) {
    pcn.wasOfferMade = appointment.wasOfferMade
  }
  if (appointment.whyDidntMoveForward) {
    pcn.whyDidntMoveForward = appointment.whyDidntMoveForward
  }
  if (appointment.notMovingForwardNotes) {
    pcn.notMovingForwardNotes = appointment.notMovingForwardNotes
  }
  if (appointment.whyNoOffer) {
    pcn.whyNoOffer = appointment.whyNoOffer as any
  }
  if (appointment.whyNoOfferNotes) {
    pcn.whyNoOfferNotes = appointment.whyNoOfferNotes
  }
  if (appointment.downsellOpportunity) {
    pcn.downsellOpportunity = appointment.downsellOpportunity
  }
  if (appointment.disqualificationReason) {
    pcn.disqualificationReason = appointment.disqualificationReason
  }
  if (appointment.followUpScheduled !== null && appointment.followUpScheduled !== undefined) {
    pcn.followUpScheduled = appointment.followUpScheduled
  }
  if (appointment.nurtureType) {
    pcn.nurtureType = appointment.nurtureType
  }
  if (appointment.cashCollected) {
    pcn.cashCollected = appointment.cashCollected
  }
  if (appointment.paymentPlanOrPIF) {
    pcn.paymentPlanOrPIF = appointment.paymentPlanOrPIF as any
  }
  if (appointment.totalPrice) {
    pcn.totalPrice = appointment.totalPrice
  }
  if (appointment.numberOfPayments) {
    pcn.numberOfPayments = appointment.numberOfPayments
  }
  if (appointment.signedNotes) {
    pcn.signedNotes = appointment.signedNotes
  }
  if (appointment.noShowCommunicative) {
    pcn.noShowCommunicative = appointment.noShowCommunicative as any
  }
  if (appointment.noShowCommunicativeNotes) {
    pcn.noShowCommunicativeNotes = appointment.noShowCommunicativeNotes
  }
  if (appointment.didCallAndText !== null && appointment.didCallAndText !== undefined) {
    pcn.didCallAndText = appointment.didCallAndText
  }
  if (appointment.cancellationReason) {
    pcn.cancellationReason = appointment.cancellationReason
  }
  if (appointment.cancellationNotes) {
    pcn.cancellationNotes = appointment.cancellationNotes
  }
  if (appointment.notes) {
    pcn.notes = appointment.notes
  }

  return pcn
}

/**
 * Compare two PCN submissions and extract changes
 */
export function extractPCNChanges(
  previous: PCNSubmission | null,
  current: PCNSubmission
): Record<string, { old: any; new: any }> {
  const changes: Record<string, { old: any; new: any }> = {}

  if (!previous) {
    // All fields are new
    Object.keys(current).forEach(key => {
      if (current[key as keyof PCNSubmission] !== null && current[key as keyof PCNSubmission] !== undefined) {
        changes[key] = {
          old: null,
          new: current[key as keyof PCNSubmission]
        }
      }
    })
    return changes
  }

  // Compare each field
  const fieldsToCheck: (keyof PCNSubmission)[] = [
    'callOutcome',
    'firstCallOrFollowUp',
    'qualificationStatus',
    'wasOfferMade',
    'whyDidntMoveForward',
    'notMovingForwardNotes',
    'whyNoOffer',
    'whyNoOfferNotes',
    'downsellOpportunity',
    'disqualificationReason',
    'followUpScheduled',
    'nurtureType',
    'cashCollected',
    'paymentPlanOrPIF',
    'totalPrice',
    'numberOfPayments',
    'signedNotes',
    'noShowCommunicative',
    'noShowCommunicativeNotes',
    'didCallAndText',
    'cancellationReason',
    'cancellationNotes',
    'notes'
  ]

  fieldsToCheck.forEach(field => {
    const oldValue = previous[field]
    const newValue = current[field]

    // Check if value changed (handling null/undefined)
    if (oldValue !== newValue && 
        !(oldValue === null && newValue === undefined) &&
        !(oldValue === undefined && newValue === null)) {
      changes[field] = {
        old: oldValue ?? null,
        new: newValue ?? null
      }
    }
  })

  return changes
}

/**
 * Log a PCN change to the changelog
 */
export async function logPCNChange(params: LogPCNChangeParams): Promise<void> {
  await withPrisma(async (prisma) => {
    await prisma.pCNChangelog.create({
      data: {
        appointmentId: params.appointmentId,
        companyId: params.companyId,
        action: params.action,
        actorUserId: params.actorUserId || null,
        actorName: params.actorName || null,
        changes: params.changes ? (params.changes as any) : null,
        previousData: params.previousData ? (params.previousData as any) : null,
        newData: params.newData ? (params.newData as any) : null,
        notes: params.notes || null,
        source: params.source || 'manual'
      }
    })
  })
}

/**
 * Log PCN creation (first submission)
 */
export async function logPCNCreation(
  appointmentId: string,
  companyId: string,
  pcnData: PCNSubmission,
  actorUserId?: string | null,
  actorName?: string | null,
  source: PCNChangelogSource = 'manual'
): Promise<void> {
  await logPCNChange({
    appointmentId,
    companyId,
    action: 'created',
    actorUserId,
    actorName,
    newData: pcnData,
    source
  })
}

/**
 * Log PCN update (edits)
 */
export async function logPCNUpdate(
  appointmentId: string,
  companyId: string,
  previousData: PCNSubmission,
  newData: PCNSubmission,
  actorUserId?: string | null,
  actorName?: string | null,
  source: PCNChangelogSource = 'manual'
): Promise<void> {
  const changes = extractPCNChanges(previousData, newData)

  await logPCNChange({
    appointmentId,
    companyId,
    action: 'updated',
    actorUserId,
    actorName,
    previousData,
    newData,
    changes: Object.keys(changes).length > 0 ? changes : undefined,
    source
  })
}

/**
 * Log AI-generated PCN
 */
export async function logAIGeneratedPCN(
  appointmentId: string,
  companyId: string,
  pcnData: PCNSubmission,
  notes?: string
): Promise<void> {
  await logPCNChange({
    appointmentId,
    companyId,
    action: 'ai_generated',
    actorName: 'Zoom AI',
    newData: pcnData,
    notes: notes || 'PCN generated from Zoom transcript analysis',
    source: 'ai'
  })
}

/**
 * Log PCN review
 */
export async function logPCNReview(
  appointmentId: string,
  companyId: string,
  action: 'reviewed' | 'approved' | 'rejected',
  actorUserId: string,
  actorName: string,
  notes?: string
): Promise<void> {
  await logPCNChange({
    appointmentId,
    companyId,
    action,
    actorUserId,
    actorName,
    notes: notes || null,
    source: 'slack'
  })
}

/**
 * Get changelog for an appointment
 */
export async function getPCNChangelog(
  appointmentId: string,
  companyId: string
): Promise<any[]> {
  return await withPrisma(async (prisma) => {
    return await prisma.pCNChangelog.findMany({
      where: {
        appointmentId,
        companyId
      },
      include: {
        actor: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    })
  })
}

