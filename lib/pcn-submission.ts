import { withPrisma } from '@/lib/db'
import { Prisma, Appointment, User } from '@prisma/client'
import { PCNSubmission } from '@/types/pcn'
import { recalculateContactInclusionFlags } from '@/lib/appointment-inclusion-flag'
import { calculateCommission } from '@/lib/payment-matcher'

type SubmitPCNParams = {
  appointmentId: string
  companyId: string
  submission: PCNSubmission
  actorUserId?: string | null
  actorName?: string | null
}

export function validatePCNSubmission(submission: PCNSubmission): string | null {
  if (!submission.callOutcome) {
    return 'Call outcome is required'
  }

  switch (submission.callOutcome) {
    case 'showed':
      if (!submission.firstCallOrFollowUp) {
        return 'Please indicate if this was a first call or follow-up'
      }
      if (submission.wasOfferMade === undefined || submission.wasOfferMade === null) {
        return 'Please indicate if an offer was made'
      }
      if (submission.wasOfferMade && !submission.whyDidntMoveForward) {
        return 'Please provide a reason why the prospect didn\'t move forward'
      }
      if (submission.followUpScheduled && !submission.followUpDate) {
        return 'Please provide follow-up date'
      }
      if (submission.followUpScheduled && !submission.nurtureType) {
        return 'Please select nurture type for follow-up'
      }
      break

    case 'signed':
      if (!submission.cashCollected || submission.cashCollected <= 0) {
        return 'Please enter the cash collected amount'
      }
      break

    case 'no_show':
      if (submission.noShowCommunicative === undefined || submission.noShowCommunicative === null) {
        return 'Please indicate if the no-show was communicative'
      }
      break

    case 'cancelled':
      if (!submission.cancellationReason) {
        return 'Please provide a cancellation reason'
      }
      break
  }

  return null
}

export async function submitPCN({
  appointmentId,
  companyId,
  submission,
  actorUserId = null,
  actorName = null
}: SubmitPCNParams) {
  const validationError = validatePCNSubmission(submission)
  if (validationError) {
    throw new Error(validationError)
  }

  const statusMap: Record<string, string> = {
    showed: 'showed',
    no_show: 'no_show',
    signed: 'signed',
    contract_sent: 'contract_sent',
    cancelled: 'cancelled'
  }

  return await withPrisma(async (prisma) => {
    const existingAppointment = await prisma.appointment.findFirst({
      where: {
        id: appointmentId,
        companyId
      },
      include: {
        contact: { select: { id: true, name: true, email: true } },
        closer: { select: { id: true, name: true, commissionRole: true, customCommissionRate: true } }
      }
    })

    if (!existingAppointment) {
      throw new Error('Appointment not found or access denied')
    }

    const newStatus = statusMap[submission.callOutcome] || existingAppointment.status

    const updateData: Prisma.AppointmentUpdateInput = {
      status: newStatus,
      outcome: submission.callOutcome,
      pcnSubmitted: true,
      pcnSubmittedAt: new Date(),
      pcnSubmittedByUserId: actorUserId ?? undefined,
      notes: submission.notes || null
    }

    if (submission.callOutcome === 'showed') {
      Object.assign(updateData, {
        firstCallOrFollowUp: submission.firstCallOrFollowUp || null,
        wasOfferMade: submission.wasOfferMade ?? null,
        whyDidntMoveForward: submission.whyDidntMoveForward || null,
        notMovingForwardNotes: submission.notMovingForwardNotes || null,
        objectionType: submission.objectionType || null,
        objectionNotes: submission.objectionNotes || null,
        followUpScheduled: submission.followUpScheduled ?? false,
        followUpDate: submission.followUpDate ? new Date(submission.followUpDate) : null,
        nurtureType: submission.nurtureType || null,
        qualificationStatus: submission.qualificationStatus || null,
        disqualificationReason: submission.disqualificationReason || null
      })
    }

    if (submission.callOutcome === 'signed') {
      Object.assign(updateData, {
        signedNotes: submission.signedNotes || null,
        cashCollected: submission.cashCollected || null,
        qualificationStatus: 'qualified'
      })
    }

    if (submission.callOutcome === 'no_show') {
      Object.assign(updateData, {
        noShowCommunicative: submission.noShowCommunicative ?? null,
        noShowCommunicativeNotes: submission.noShowCommunicativeNotes || null
      })
    }

    if (submission.callOutcome === 'cancelled') {
      Object.assign(updateData, {
        cancellationReason: submission.cancellationReason || null,
        cancellationNotes: submission.cancellationNotes || null
      })
    }

    const updatedAppointment = await prisma.appointment.update({
      where: { id: appointmentId },
      data: updateData,
      include: {
        contact: { select: { id: true, name: true, email: true } },
        closer: { select: { id: true, name: true, commissionRole: true, customCommissionRate: true } }
      }
    })

    if (submission.callOutcome === 'signed' && updatedAppointment.contact?.email) {
      try {
        const unmatchedPayments = await prisma.unmatchedPayment.findMany({
          where: {
            companyId,
            status: 'pending'
          },
          include: { sale: true },
          orderBy: { createdAt: 'desc' }
        })

        const unmatchedPayment = unmatchedPayments.find(
          (up) => up.sale.customerEmail?.toLowerCase() === updatedAppointment.contact?.email?.toLowerCase()
        )

        if (unmatchedPayment) {
          await prisma.sale.update({
            where: { id: unmatchedPayment.saleId },
            data: {
              appointmentId,
              matchedBy: actorName ? `pcn_submission:${actorName}` : 'pcn_submission',
              matchConfidence: 0.9,
              manuallyMatched: false,
              matchedByUserId: actorUserId ?? null
            }
          })

          if (updatedAppointment.closer) {
            const closer = await prisma.user.findUnique({
              where: { id: updatedAppointment.closer.id },
              include: { commissionRole: true }
            })

            if (closer) {
              const commissionRate =
                closer.customCommissionRate ||
                closer.commissionRole?.defaultRate ||
                0.10

              const commissionResult = calculateCommission(
                Number(unmatchedPayment.sale.amount),
                commissionRate,
                Number(unmatchedPayment.sale.amount)
              )
              const totalCommission = commissionResult.totalCommission
              const releasedCommission = commissionResult.releasedCommission

              await prisma.commission.create({
                data: {
                  amount: releasedCommission,
                  totalAmount: totalCommission,
                  releasedAmount: releasedCommission,
                  percentage: commissionRate,
                  status: 'pending',
                  releaseStatus: 'released',
                  companyId,
                  saleId: unmatchedPayment.saleId,
                  repId: closer.id
                }
              })

              await prisma.unmatchedPayment.update({
                where: { id: unmatchedPayment.id },
                data: {
                  status: 'matched',
                  reviewedAt: new Date(),
                  reviewedByUserId: actorUserId ?? null
                }
              })
            }
          }
        }
      } catch (matchError: any) {
        console.error('[PCN] Error matching payment:', matchError)
      }
    }

    await prisma.webhookEvent.create({
      data: {
        processor: 'internal',
        eventType: 'pcn.submitted',
        companyId,
        payload: {
          appointmentId,
          userId: actorUserId ?? null,
          userName: actorName ?? null,
          outcome: submission.callOutcome,
          timestamp: new Date().toISOString(),
          autoSubmitted: !actorUserId
        },
        processed: true,
        processedAt: new Date()
      }
    })

    try {
      await recalculateContactInclusionFlags(
        updatedAppointment.contactId,
        companyId
      )
      console.log(`[PCN] Recalculated inclusion flags for contact ${updatedAppointment.contactId}`)
    } catch (flagError: any) {
      console.error('[PCN] Error calculating inclusion flag:', flagError)
    }

    return {
      appointment: {
        id: updatedAppointment.id,
        status: updatedAppointment.status,
        outcome: updatedAppointment.outcome,
        pcnSubmitted: updatedAppointment.pcnSubmitted,
        pcnSubmittedAt: updatedAppointment.pcnSubmittedAt?.toISOString(),
        contactName: updatedAppointment.contact?.name ?? null,
        closerName: updatedAppointment.closer?.name ?? null
      }
    }
  })
}

