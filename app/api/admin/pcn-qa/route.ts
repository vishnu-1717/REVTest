import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { getEffectiveCompanyId } from '@/lib/company-context'
import { withPrisma } from '@/lib/db'
import { getPCNChangelog } from '@/lib/pcn-changelog'
import { Prisma } from '@prisma/client'

/**
 * Get AI-generated PCNs pending review
 * GET /api/admin/pcn-qa
 */
export async function GET(request: NextRequest) {
  try {
    const user = await requireAdmin()
    const companyId = await getEffectiveCompanyId(request.url)

    if (!user.superAdmin && companyId !== user.companyId) {
      return NextResponse.json(
        { error: 'You do not have permission to view this company' },
        { status: 403 }
      )
    }

    const appointments = await withPrisma(async (prisma) => {
      return await prisma.appointment.findMany({
        where: {
          companyId,
          customFields: {
            path: ['aiGeneratedPCN'],
            not: Prisma.JsonNull
          },
          pcnSubmitted: false
        },
        include: {
          contact: {
            select: {
              name: true,
              email: true
            }
          },
          closer: {
            select: {
              name: true,
              email: true
            }
          }
        },
        orderBy: {
          scheduledAt: 'desc'
        },
        take: 50 // Limit to recent 50
      })
    })

    // Extract AI-generated PCN data
    const pendingPCNs = appointments.map(apt => {
      const customFields = apt.customFields as any
      return {
        appointmentId: apt.id,
        contactName: apt.contact.name,
        contactEmail: apt.contact.email,
        closerName: apt.closer?.name || 'Unknown',
        scheduledAt: apt.scheduledAt.toISOString(),
        aiGeneratedPCN: customFields?.aiGeneratedPCN,
        aiGeneratedAt: customFields?.aiGeneratedPCNAt,
        changelog: [] // Will be populated separately if needed
      }
    })

    return NextResponse.json({ pendingPCNs })
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to fetch pending PCNs' },
      { status: 500 }
    )
  }
}

/**
 * Get changelog for a specific appointment
 * GET /api/admin/pcn-qa?appointmentId=xxx
 */
export async function getChangelog(request: NextRequest) {
  try {
    const user = await requireAdmin()
    const companyId = await getEffectiveCompanyId(request.url)
    const appointmentId = request.nextUrl.searchParams.get('appointmentId')

    if (!appointmentId) {
      return NextResponse.json(
        { error: 'appointmentId is required' },
        { status: 400 }
      )
    }

    if (!user.superAdmin && companyId !== user.companyId) {
      return NextResponse.json(
        { error: 'You do not have permission to view this company' },
        { status: 403 }
      )
    }

    const changelog = await getPCNChangelog(appointmentId, companyId)

    return NextResponse.json({ changelog })
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to fetch changelog' },
      { status: 500 }
    )
  }
}

