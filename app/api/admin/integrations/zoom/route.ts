import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { withPrisma } from '@/lib/db'
import { getEffectiveCompanyId } from '@/lib/company-context'
import { createZoomClient } from '@/lib/zoom-api'
import crypto from 'crypto'

// Encryption utilities (reuse from zoom-api)
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || crypto.randomBytes(32).toString('hex')
const ALGORITHM = 'aes-256-gcm'

function encrypt(text: string): string {
  const iv = crypto.randomBytes(16)
  const cipher = crypto.createCipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY, 'hex'), iv)
  
  let encrypted = cipher.update(text, 'utf8', 'hex')
  encrypted += cipher.final('hex')
  
  const authTag = cipher.getAuthTag()
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`
}

/**
 * Save Zoom credentials
 * POST /api/admin/integrations/zoom
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireAdmin()
    const { accountId, clientId, clientSecret, autoSubmitPCN } = await request.json()
    const companyId = await getEffectiveCompanyId(request.url)
    
    if (!accountId || !clientId || !clientSecret) {
      return NextResponse.json(
        { error: 'Account ID, Client ID, and Client Secret are required' },
        { status: 400 }
      )
    }

    if (!user.superAdmin && companyId !== user.companyId) {
      return NextResponse.json(
        { error: 'You do not have permission to modify this company' },
        { status: 403 }
      )
    }
    
    // Test credentials by attempting to get an access token
    try {
      // Create a temporary client to test
      const { ZoomClient } = await import('@/lib/zoom-api')
      const testClient = new ZoomClient(accountId, clientId, clientSecret, companyId)
      
      const isValid = await testClient.validateCredentials()
      if (!isValid) {
        return NextResponse.json(
          { error: 'Invalid Zoom credentials. Please check your Account ID, Client ID, and Client Secret.' },
          { status: 400 }
        )
      }
      
      console.log(`Zoom credentials validation successful for company ${companyId}`)
    } catch (error: any) {
      console.error('Zoom credential validation error:', error)
      return NextResponse.json(
        { error: `Failed to validate credentials: ${error.message}` },
        { status: 400 }
      )
    }

    // Encrypt and store credentials
    await withPrisma(async (prisma) => {
      await prisma.company.update({
        where: { id: companyId },
        data: {
          zoomAccountId: accountId,
          zoomClientId: clientId,
          zoomClientSecret: encrypt(clientSecret),
          zoomAutoSubmitPCN: autoSubmitPCN === true,
          zoomConnectedAt: new Date()
        }
      })
    })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Zoom setup error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to save Zoom credentials' },
      { status: 500 }
    )
  }
}

/**
 * Get current Zoom setup status
 * GET /api/admin/integrations/zoom
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
    
    const company = await withPrisma(async (prisma) => {
      return await prisma.company.findUnique({
        where: { id: companyId },
        select: {
          zoomAccountId: true,
          zoomClientId: true,
          zoomConnectedAt: true,
          zoomAutoSubmitPCN: true
        }
      })
    })
    
    return NextResponse.json({
      configured: !!(company?.zoomAccountId && company?.zoomClientId),
      accountId: company?.zoomAccountId,
      clientId: company?.zoomClientId,
      connectedAt: company?.zoomConnectedAt?.toISOString() || null,
      autoSubmitPCN: company?.zoomAutoSubmitPCN || false
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

