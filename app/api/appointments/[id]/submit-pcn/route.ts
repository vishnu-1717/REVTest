import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { withPrisma } from '@/lib/db'
import { PCNSubmission } from '@/types/pcn'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth()
    
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params

    const result = await withPrisma(async (prisma) => {
      const user = await prisma.user.findUnique({
        where: { clerkId: userId }
      })

      if (!user) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 })
      }

      const body: PCNSubmission = await request.json()
      
      // Validate
      const validationError = validatePCNSubmission(body)
      if (validationError) {
        return NextResponse.json({ error: validationError }, { status: 400 })
      }

      // Verify appointment exists and user has access
      const whereClause: any = {
        id: id,
        companyId: user.companyId
      }

      if (user.role !== 'admin' && !user.superAdmin) {
        whereClause.closerId = user.id
      }

      const existingAppointment = await prisma.appointment.findFirst({
        where: whereClause
      })

      if (!existingAppointment) {
        return NextResponse.json(
          { error: 'Appointment not found or access denied' },
          { status: 404 }
        )
      }

      // Map call outcome to appointment status
      const statusMap: Record<string, string> = {
        'showed': 'showed',
        'no_show': 'no_show',
        'signed': 'signed',
        'contract_sent': 'contract_sent',
        'cancelled': 'cancelled'
      }

      const newStatus = statusMap[body.callOutcome] || existingAppointment.status

      // Prepare update data
      const updateData: any = {
        status: newStatus,
        outcome: body.callOutcome,
        pcnSubmitted: true,
        pcnSubmittedAt: new Date(),
        pcnSubmittedByUserId: user.id,
        notes: body.notes || null
      }

      // Add fields based on outcome
      if (body.callOutcome === 'showed') {
        updateData.firstCallOrFollowUp = body.firstCallOrFollowUp || null
        updateData.wasOfferMade = body.wasOfferMade ?? null
        updateData.whyDidntMoveForward = body.whyDidntMoveForward || null
        updateData.notMovingForwardNotes = body.notMovingForwardNotes || null
        updateData.objectionType = body.objectionType || null
        updateData.objectionNotes = body.objectionNotes || null
        updateData.followUpScheduled = body.followUpScheduled ?? false
        updateData.followUpDate = body.followUpDate ? new Date(body.followUpDate) : null
        updateData.nurtureType = body.nurtureType || null
        updateData.qualificationStatus = body.qualificationStatus || null
        updateData.disqualificationReason = body.disqualificationReason || null
      }

      if (body.callOutcome === 'signed') {
        updateData.signedNotes = body.signedNotes || null
        updateData.cashCollected = body.cashCollected || null
        updateData.qualificationStatus = 'qualified'
      }

      if (body.callOutcome === 'no_show') {
        updateData.noShowCommunicative = body.noShowCommunicative ?? null
        updateData.noShowCommunicativeNotes = body.noShowCommunicativeNotes || null
      }

      if (body.callOutcome === 'cancelled') {
        updateData.cancellationReason = body.cancellationReason || null
        updateData.cancellationNotes = body.cancellationNotes || null
      }

      // Update appointment
      const updatedAppointment = await prisma.appointment.update({
        where: { id: id },
        data: updateData,
        include: {
          contact: { select: { name: true } },
          closer: { select: { name: true } }
        }
      })

      // Create audit log
      await prisma.webhookEvent.create({
        data: {
          processor: 'internal',
          eventType: 'pcn.submitted',
          companyId: user.companyId,
          payload: {
            appointmentId: id,
            userId: user.id,
            userName: user.name,
            outcome: body.callOutcome,
            timestamp: new Date().toISOString()
          },
          processed: true,
          processedAt: new Date()
        }
      })

      console.log(`[PCN] Submitted for ${id} by ${user.name} - Outcome: ${body.callOutcome}`)

      return {
        success: true,
        appointment: {
          id: updatedAppointment.id,
          status: updatedAppointment.status,
          outcome: updatedAppointment.outcome,
          pcnSubmitted: updatedAppointment.pcnSubmitted,
          pcnSubmittedAt: updatedAppointment.pcnSubmittedAt?.toISOString(),
          contactName: updatedAppointment.contact.name,
          closerName: updatedAppointment.closer?.name || null
        }
      }
    })

    // Check if result is an error response
    if (result && typeof result === 'object' && 'error' in result && 'status' in result) {
      return NextResponse.json({ error: result.error }, { status: result.status as number })
    }

    return NextResponse.json(result)
  } catch (error: any) {
    console.error('[API] Error submitting PCN:', error)
    return NextResponse.json(
      { error: 'Failed to submit PCN', details: error.message },
      { status: 500 }
    )
  }
}

function validatePCNSubmission(submission: PCNSubmission): string | null {
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

