import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { getEffectiveCompanyId } from '@/lib/company-context'
import { withPrisma } from '@/lib/db'

export async function POST(request: NextRequest) {
  try {
    await requireAdmin()
    
    const companyId = await getEffectiveCompanyId(request.url)
    
    await withPrisma(async (prisma) => {
      // Clear all Zoom fields
      await prisma.company.update({
        where: { id: companyId },
        data: {
          zoomAccountId: null,
          zoomClientId: null,
          zoomClientSecret: null,
          zoomAccessToken: null,
          zoomRefreshToken: null,
          zoomTokenExpiresAt: null,
          zoomConnectedAt: null,
          zoomWebhookSecret: null,
        },
      })
    })
    
    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('[Zoom Disconnect] Error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

