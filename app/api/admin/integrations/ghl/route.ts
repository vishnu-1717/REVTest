import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { withPrisma } from '@/lib/db'
import { getEffectiveCompanyId } from '@/lib/company-context'

// Get current GHL setup status (OAuth only)
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
    
    const company = await withPrisma(async (prisma) => {
      return await prisma.company.findUnique({
        where: { id: companyId },
        select: {
          ghlLocationId: true,
          ghlOAuthAccessToken: true,
          ghlOAuthRefreshToken: true,
          ghlOAuthExpiresAt: true,
          ghlAppInstalledAt: true,
          ghlAppUninstalledAt: true,
          timezone: true,
          attributionStrategy: true,
          attributionSourceField: true,
          useCalendarsForAttribution: true
        }
      })
    })
    
    // Check OAuth connection status
    const oauthConnected = !!(
      company?.ghlOAuthAccessToken &&
      company?.ghlOAuthRefreshToken &&
      !company.ghlAppUninstalledAt
    )
    
    return NextResponse.json({
      configured: oauthConnected,
      oauthConnected,
      locationId: company?.ghlLocationId,
      timezone: company?.timezone || 'UTC',
      attributionStrategy: company?.attributionStrategy,
      attributionSourceField: company?.attributionSourceField,
      useCalendarsForAttribution: company?.useCalendarsForAttribution,
      appInstalledAt: company?.ghlAppInstalledAt?.toISOString() || null
    })
    
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
