import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { getEffectiveCompanyId } from '@/lib/company-context'
import { withPrisma } from '@/lib/db'
import { clearGHLOAuthTokens } from '@/lib/ghl-oauth'

/**
 * Disconnect GHL OAuth integration
 * POST /api/admin/integrations/ghl/disconnect
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireAdmin()
    const companyId = await getEffectiveCompanyId(request.url)

    if (!user.superAdmin && companyId !== user.companyId) {
      return NextResponse.json(
        { error: 'You do not have permission to disconnect this company' },
        { status: 403 }
      )
    }

    // Clear OAuth tokens
    await clearGHLOAuthTokens(companyId)

    // Also clear API key credentials if they exist
    await withPrisma(async (prisma) => {
      await prisma.company.update({
        where: { id: companyId },
        data: {
          ghlApiKey: null,
          ghlLocationId: null,
          ghlWebhookSecret: null
        }
      })
    })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('[GHL Disconnect] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to disconnect GHL' },
      { status: 500 }
    )
  }
}

