import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { getEffectiveCompanyId } from '@/lib/company-context'
import { withPrisma } from '@/lib/db'
import { logPCNReview } from '@/lib/pcn-changelog'

/**
 * Reject AI-generated PCN
 * POST /api/admin/pcn-qa/reject
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireAdmin()
    const companyId = await getEffectiveCompanyId(request.url)
    const { appointmentId, reason } = await request.json()

    if (!appointmentId) {
      return NextResponse.json(
        { error: 'appointmentId is required' },
        { status: 400 }
      )
    }

    if (!user.superAdmin && companyId !== user.companyId) {
      return NextResponse.json(
        { error: 'You do not have permission to reject this PCN' },
        { status: 403 }
      )
    }

    // Get appointment
    const appointment = await withPrisma(async (prisma) => {
      return await prisma.appointment.findUnique({
        where: { id: appointmentId },
        select: {
          id: true,
          companyId: true,
          customFields: true
        }
      })
    })

    if (!appointment || appointment.companyId !== companyId) {
      return NextResponse.json(
        { error: 'Appointment not found' },
        { status: 404 }
      )
    }

    // Log rejection
    await logPCNReview(
      appointmentId,
      companyId,
      'rejected',
      user.id,
      user.name || 'Admin',
      reason || 'Rejected via QA dashboard'
    )

    // Clear AI-generated PCN from customFields
    await withPrisma(async (prisma) => {
      const customFields = appointment.customFields as any
      const updatedCustomFields = { ...customFields }
      delete updatedCustomFields.aiGeneratedPCN
      delete updatedCustomFields.aiGeneratedPCNAt

      await prisma.appointment.update({
        where: { id: appointmentId },
        data: {
          customFields: updatedCustomFields
        }
      })
    })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to reject PCN' },
      { status: 500 }
    )
  }
}

