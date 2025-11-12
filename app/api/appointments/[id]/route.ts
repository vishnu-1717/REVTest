import { NextRequest, NextResponse } from 'next/server'
import { withPrisma } from '@/lib/db'
import { getEffectiveUser } from '@/lib/auth'
import { getEffectiveCompanyId } from '@/lib/company-context'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getEffectiveUser()
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    const effectiveCompanyId = await getEffectiveCompanyId(request.url)

    if (!user.superAdmin && user.companyId !== effectiveCompanyId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const result = await withPrisma(async (prisma) => {

      // Build where clause based on role
      const whereClause: any = {
        id: id,
        companyId: effectiveCompanyId
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

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getEffectiveUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (user.role !== 'admin' && !user.superAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await params
    const effectiveCompanyId = await getEffectiveCompanyId(request.url)

    if (!user.superAdmin && user.companyId !== effectiveCompanyId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const result = await withPrisma(async (prisma) => {
      try {
        return await prisma.$transaction(async (tx) => {
          const appointment = await tx.appointment.findFirst({
            where: {
              id,
              companyId: effectiveCompanyId
            },
            include: {
              matchedSales: {
                select: {
                  id: true
                }
              }
            }
          })

          if (!appointment) {
            return { error: 'Appointment not found', status: 404 }
          }

          // Detach any sales matched to this appointment to avoid FK violations
          if (appointment.matchedSales.length > 0) {
            await tx.sale.updateMany({
              where: {
                id: {
                  in: appointment.matchedSales.map((sale) => sale.id)
                }
              },
              data: {
                appointmentId: null
              }
            })
          }

          await tx.appointment.delete({
            where: { id }
          })

          return { success: true }
        })
      } catch (error: any) {
        console.error('[API] Error deleting appointment:', error)
        return { error: 'Failed to delete appointment', status: 500 }
      }
    })

    if (result && 'error' in result && result.error) {
      return NextResponse.json({ error: result.error }, { status: result.status || 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('[API] Error deleting appointment:', error)
    return NextResponse.json(
      { error: 'Failed to delete appointment', details: error.message },
      { status: 500 }
    )
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getEffectiveUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!user.superAdmin && user.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await params
    const effectiveCompanyId = await getEffectiveCompanyId(request.url)

    if (!user.superAdmin && user.companyId !== effectiveCompanyId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    let body: any = {}
    try {
      body = await request.json()
    } catch (error) {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const closerIdRaw = body?.closerId
    const closerId =
      closerIdRaw === null || closerIdRaw === undefined || closerIdRaw === ''
        ? null
        : typeof closerIdRaw === 'string'
          ? closerIdRaw
          : undefined

    if (closerId === undefined) {
      return NextResponse.json({ error: 'closerId must be a string or null' }, { status: 400 })
    }

    return await withPrisma(async (prisma) => {
      const appointment = await prisma.appointment.findFirst({
        where: { id, companyId: effectiveCompanyId },
        select: { id: true }
      })

      if (!appointment) {
        return NextResponse.json({ error: 'Appointment not found' }, { status: 404 })
      }

      if (closerId) {
        const closer = await prisma.user.findFirst({
          where: {
            id: closerId,
            companyId: effectiveCompanyId,
            isActive: true,
            superAdmin: false
          },
          select: { id: true }
        })

        if (!closer) {
          return NextResponse.json(
            { error: 'Selected rep is not available for this company' },
            { status: 400 }
          )
        }
      }

      const updated = await prisma.appointment.update({
        where: { id },
        data: {
          closerId
        },
        select: {
          id: true,
          closerId: true
        }
      })

      return NextResponse.json({
        success: true,
        appointment: updated
      })
    })
  } catch (error: any) {
    console.error('[API] Error updating appointment closer:', error)
    return NextResponse.json(
      { error: 'Failed to update appointment', details: error.message },
      { status: 500 }
    )
  }
}

