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

export function validatePCNSubmission(
  submission: PCNSubmission,
  options: { strict?: boolean } = {}
): string | null {
  const { strict = true } = options

  if (!submission.callOutcome) {
    return 'Call outcome is required'
  }

  switch (submission.callOutcome) {
    case 'showed':
      // In strict mode, require firstCallOrFollowUp
      if (strict && !submission.firstCallOrFollowUp) {
        return 'Please indicate if this was a first call or follow-up'
      }
      // In strict mode, require qualificationStatus
      if (strict && !submission.qualificationStatus) {
        return 'Please select the prospect\'s qualification status'
      }
      // If qualified to purchase, require wasOfferMade
      if (strict && submission.qualificationStatus === 'qualified_to_purchase' && 
          (submission.wasOfferMade === undefined || submission.wasOfferMade === null)) {
        return 'Please indicate if an offer was made'
      }
      // If offer was made, require whyDidntMoveForward
      if (strict && submission.qualificationStatus === 'qualified_to_purchase' && 
          submission.wasOfferMade && !submission.whyDidntMoveForward) {
        return 'Please provide a reason why the prospect didn\'t move forward'
      }
      // If offer was NOT made, require whyNoOffer
      if (strict && submission.qualificationStatus === 'qualified_to_purchase' && 
          submission.wasOfferMade === false && !submission.whyNoOffer) {
        return 'Please provide a reason why no offer was made'
      }
      // If downsell opportunity, require downsellOpportunity
      if (strict && submission.qualificationStatus === 'downsell_opportunity' && !submission.downsellOpportunity) {
        return 'Please select a downsell opportunity'
      }
      // If disqualified, require disqualificationReason
      if (strict && submission.qualificationStatus === 'disqualified' && !submission.disqualificationReason) {
        return 'Please provide a disqualification reason'
      }
      // Only require nurture type if follow-up is scheduled AND we're in strict mode
      if (strict && submission.followUpScheduled && !submission.nurtureType) {
        return 'Please select nurture type for follow-up'
      }
      break

    case 'signed':
      // In strict mode, require cash collected
      if (strict && (!submission.cashCollected || submission.cashCollected <= 0)) {
        return 'Please enter the cash collected amount'
      }
      // In strict mode, require paymentPlanOrPIF
      if (strict && !submission.paymentPlanOrPIF) {
        return 'Please indicate if this is a payment plan or paid in full'
      }
      // If payment plan, require totalPrice and numberOfPayments
      if (strict && submission.paymentPlanOrPIF === 'payment_plan') {
        if (!submission.totalPrice || submission.totalPrice <= 0) {
          return 'Please enter the total price for the payment plan'
        }
        if (!submission.numberOfPayments || submission.numberOfPayments <= 0) {
          return 'Please enter the number of payments'
        }
      }
      break

    case 'no_show':
      // In strict mode, require noShowCommunicative (now a string)
      if (strict && !submission.noShowCommunicative) {
        return 'Please indicate if the no-show was communicative'
      }
      break

    case 'cancelled':
      // In strict mode, require cancellation reason
      if (strict && !submission.cancellationReason) {
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
  actorName = null,
  strictValidation = true
}: SubmitPCNParams & { strictValidation?: boolean }) {
  const validationError = validatePCNSubmission(submission, { strict: strictValidation })
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
    // Try to find appointment by ghlAppointmentId first (most common case for webhooks)
    // Then fall back to id lookup
    let existingAppointment = await prisma.appointment.findFirst({
      where: {
        companyId,
        ghlAppointmentId: appointmentId
      },
      include: {
        contact: { select: { id: true, name: true, email: true } },
        closer: { select: { id: true, name: true, commissionRole: true, customCommissionRate: true } }
      }
    })

    // If not found by ghlAppointmentId, try by id
    if (!existingAppointment) {
      existingAppointment = await prisma.appointment.findFirst({
        where: {
          companyId,
          id: appointmentId
        },
        include: {
          contact: { select: { id: true, name: true, email: true } },
          closer: { select: { id: true, name: true, commissionRole: true, customCommissionRate: true } }
        }
      })
    }

    if (!existingAppointment) {
      throw new Error(`Appointment not found or access denied. Searched for ghlAppointmentId="${appointmentId}" and id="${appointmentId}" in companyId="${companyId}"`)
    }

    const newStatus = statusMap[submission.callOutcome] || existingAppointment.status

    const updateData: Prisma.AppointmentUpdateInput = {
      status: newStatus,
      outcome: submission.callOutcome,
      pcnSubmitted: true,
      pcnSubmittedAt: new Date(),
      pcnSubmittedBy: actorUserId
        ? { connect: { id: actorUserId } }
        : actorUserId === null
        ? { disconnect: true }
        : undefined,
      notes: submission.notes || null
    }

    if (submission.callOutcome === 'showed') {
      Object.assign(updateData, {
        firstCallOrFollowUp: submission.firstCallOrFollowUp || null,
        qualificationStatus: submission.qualificationStatus || null,
        wasOfferMade: submission.wasOfferMade ?? null,
        whyDidntMoveForward: submission.whyDidntMoveForward || null,
        notMovingForwardNotes: submission.notMovingForwardNotes || null,
        whyNoOffer: submission.whyNoOffer || null,
        whyNoOfferNotes: submission.whyNoOfferNotes || null,
        downsellOpportunity: submission.downsellOpportunity || null,
        objectionType: submission.objectionType || null,
        objectionNotes: submission.objectionNotes || null,
        followUpScheduled: submission.followUpScheduled ?? false,
        followUpDate: null, // No longer required - removed from form
        nurtureType: submission.nurtureType || null,
        disqualificationReason: submission.disqualificationReason || null
      })
    }

    if (submission.callOutcome === 'signed') {
      Object.assign(updateData, {
        signedNotes: submission.signedNotes || null,
        cashCollected: submission.cashCollected || null,
        paymentPlanOrPIF: submission.paymentPlanOrPIF || null,
        totalPrice: submission.totalPrice || null,
        numberOfPayments: submission.numberOfPayments || null,
        qualificationStatus: 'qualified_to_purchase' // Signed means qualified
      })
    }

    if (submission.callOutcome === 'no_show') {
      Object.assign(updateData, {
        noShowCommunicative: submission.noShowCommunicative || null, // Now a string
        noShowCommunicativeNotes: submission.noShowCommunicativeNotes || null,
        didCallAndText: submission.didCallAndText ?? null
      })
    }

    if (submission.callOutcome === 'cancelled') {
      Object.assign(updateData, {
        cancellationReason: submission.cancellationReason || null,
        cancellationNotes: submission.cancellationNotes || null
      })
    }

    const appointmentDatabaseId = existingAppointment.id
    const externalAppointmentId = existingAppointment.ghlAppointmentId ?? appointmentId

    // Get previous PCN data for changelog
    const previousData = await prisma.appointment.findUnique({
      where: { id: appointmentDatabaseId },
      select: {
        outcome: true,
        firstCallOrFollowUp: true,
        qualificationStatus: true,
        wasOfferMade: true,
        whyDidntMoveForward: true,
        notMovingForwardNotes: true,
        whyNoOffer: true,
        whyNoOfferNotes: true,
        downsellOpportunity: true,
        disqualificationReason: true,
        followUpScheduled: true,
        nurtureType: true,
        cashCollected: true,
        paymentPlanOrPIF: true,
        totalPrice: true,
        numberOfPayments: true,
        signedNotes: true,
        noShowCommunicative: true,
        noShowCommunicativeNotes: true,
        didCallAndText: true,
        cancellationReason: true,
        cancellationNotes: true,
        notes: true
      }
    })

    const updatedAppointment = await prisma.appointment.update({
      where: { id: appointmentDatabaseId },
      data: updateData,
      include: {
        contact: { select: { id: true, name: true, email: true } },
        closer: { select: { id: true, name: true, commissionRole: true, customCommissionRate: true } }
      }
    })

    // Log PCN change
    const { logPCNCreation, logPCNUpdate, extractPCNDataFromAppointment } = await import('./pcn-changelog')
    const previousPCNData = previousData ? extractPCNDataFromAppointment(previousData) : null
    const newPCNData = extractPCNDataFromAppointment(updatedAppointment)

    if (previousPCNData && previousPCNData.callOutcome) {
      // Update
      await logPCNUpdate(
        appointmentDatabaseId,
        companyId,
        previousPCNData,
        newPCNData,
        actorUserId,
        actorName,
        actorUserId ? 'manual' : 'system'
      )
    } else {
      // Creation
      await logPCNCreation(
        appointmentDatabaseId,
        companyId,
        newPCNData,
        actorUserId,
        actorName,
        actorUserId ? 'manual' : 'system'
      )
    }

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
              appointmentId: appointmentDatabaseId,
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
          appointmentId: appointmentDatabaseId,
          externalAppointmentId,
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

