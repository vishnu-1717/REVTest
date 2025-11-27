import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { getEffectiveCompanyId } from '@/lib/company-context'
import { withPrisma } from '@/lib/db'
import { submitPCN } from '@/lib/pcn-submission'
import { logPCNReview } from '@/lib/pcn-changelog'

/**
 * Approve and submit AI-generated PCN
 * POST /api/admin/pcn-qa/approve
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireAdmin()
    const companyId = await getEffectiveCompanyId(request.url)
    const { appointmentId } = await request.json()

    if (!appointmentId) {
      return NextResponse.json(
        { error: 'appointmentId is required' },
        { status: 400 }
      )
    }

    if (!user.superAdmin && companyId !== user.companyId) {
      return NextResponse.json(
        { error: 'You do not have permission to approve this PCN' },
        { status: 403 }
      )
    }

    // Get appointment and AI-generated PCN
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

    const customFields = appointment.customFields as any
    const aiGeneratedPCN = customFields?.aiGeneratedPCN

    if (!aiGeneratedPCN) {
      return NextResponse.json(
        { error: 'No AI-generated PCN found' },
        { status: 400 }
      )
    }

    // Submit PCN
    await submitPCN({
      appointmentId,
      companyId,
      submission: aiGeneratedPCN,
      actorUserId: user.id,
      actorName: user.name || null,
      strictValidation: false
    })

    // Log approval
    await logPCNReview(
      appointmentId,
      companyId,
      'approved',
      user.id,
      user.name || 'Admin',
      'Approved via QA dashboard'
    )

    // Clear AI-generated PCN from customFields
    await withPrisma(async (prisma) => {
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
      { error: error.message || 'Failed to approve PCN' },
      { status: 500 }
    )
  }
}

