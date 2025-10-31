import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { withPrisma } from '@/lib/db'

export async function GET(
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
      // Get user from database
      const user = await prisma.user.findUnique({
        where: { clerkId: userId }
      })

      if (!user) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 })
      }

      // Build where clause based on role
      const whereClause: any = {
        id: id,
        companyId: user.companyId
      }

      // Reps can only see their own appointments
      if (user.role !== 'admin' && !user.superAdmin) {
        whereClause.closerId = user.id
      }

      const appointment = await prisma.appointment.findFirst({
        where: whereClause,
        include: {
          contact: {
            select: {
              name: true,
              email: true,
              phone: true
            }
          },
          closer: {
            select: {
              id: true,
              name: true,
              email: true
            }
          },
          setter: {
            select: {
              id: true,
              name: true
            }
          },
          calendarRelation: {
            select: {
              id: true,
              name: true,
              trafficSource: true
            }
          },
          sale: {
            select: {
              id: true,
              amount: true,
              status: true,
              paidAt: true
            }
          }
        }
      })

      if (!appointment) {
        return NextResponse.json({ error: 'Appointment not found' }, { status: 404 })
      }

      // Format response
      const response = {
        id: appointment.id,
        scheduledAt: appointment.scheduledAt.toISOString(),
        startTime: appointment.startTime?.toISOString() || null,
        endTime: appointment.endTime?.toISOString() || null,
        status: appointment.status,
        
        contactId: appointment.contactId,
        contactName: appointment.contact.name,
        contactEmail: appointment.contact.email,
        contactPhone: appointment.contact.phone,
        
        closerId: appointment.closerId,
        closerName: appointment.closer?.name || null,
        closerEmail: appointment.closer?.email || null,
        
        setterId: appointment.setterId,
        setterName: appointment.setter?.name || null,
        
        calendarId: appointment.calendarId,
        calendarName: appointment.calendarRelation?.name || null,
        trafficSource: appointment.calendarRelation?.trafficSource || null,
        
        attributionSource: appointment.attributionSource,
        
        pcnSubmitted: appointment.pcnSubmitted,
        pcnSubmittedAt: appointment.pcnSubmittedAt?.toISOString() || null,
        pcnSubmittedByUserId: appointment.pcnSubmittedByUserId,
        
        outcome: appointment.outcome,
        firstCallOrFollowUp: appointment.firstCallOrFollowUp,
        wasOfferMade: appointment.wasOfferMade,
        whyDidntMoveForward: appointment.whyDidntMoveForward,
        notMovingForwardNotes: appointment.notMovingForwardNotes,
        objectionType: appointment.objectionType,
        objectionNotes: appointment.objectionNotes,
        followUpScheduled: appointment.followUpScheduled,
        followUpDate: appointment.followUpDate?.toISOString() || null,
        nurtureType: appointment.nurtureType,
        qualificationStatus: appointment.qualificationStatus,
        disqualificationReason: appointment.disqualificationReason,
        signedNotes: appointment.signedNotes,
        cashCollected: appointment.cashCollected,
        noShowCommunicative: appointment.noShowCommunicative,
        noShowCommunicativeNotes: appointment.noShowCommunicativeNotes,
        cancellationReason: appointment.cancellationReason,
        cancellationNotes: appointment.cancellationNotes,
        notes: appointment.notes,
        
        sale: appointment.sale ? {
          id: appointment.sale.id,
          amount: Number(appointment.sale.amount),
          status: appointment.sale.status,
          paidAt: appointment.sale.paidAt?.toISOString() || null
        } : null,
        
        duration: appointment.duration,
        recordingUrl: appointment.recordingUrl,
        ghlAppointmentId: appointment.ghlAppointmentId,
        
        createdAt: appointment.createdAt.toISOString(),
        updatedAt: appointment.updatedAt.toISOString()
      }

      return response
    })

    // Check if result is an error response
    if (result && typeof result === 'object' && 'error' in result && 'status' in result) {
      return NextResponse.json({ error: result.error }, { status: result.status as number })
    }

    return NextResponse.json(result)
  } catch (error: any) {
    console.error('[API] Error fetching appointment:', error)
    return NextResponse.json(
      { error: 'Failed to fetch appointment', details: error.message },
      { status: 500 }
    )
  }
}

