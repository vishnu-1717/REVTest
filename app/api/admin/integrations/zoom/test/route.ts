import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { getEffectiveCompanyId } from '@/lib/company-context'
import { ZoomClient } from '@/lib/zoom-api'

/**
 * Test Zoom connection
 * POST /api/admin/integrations/zoom/test
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireAdmin()
    const { accountId, clientId, clientSecret } = await request.json()
    const companyId = await getEffectiveCompanyId(request.url)

    if (!accountId || !clientId || !clientSecret) {
      return NextResponse.json(
        { error: 'Account ID, Client ID, and Client Secret are required' },
        { status: 400 }
      )
    }

    if (!user.superAdmin && companyId !== user.companyId) {
      return NextResponse.json(
        { error: 'You do not have permission to test this company' },
        { status: 403 }
      )
    }

    // Test credentials
    try {
      const testClient = new ZoomClient(accountId, clientId, clientSecret, companyId)
      const isValid = await testClient.validateCredentials()
      
      if (isValid) {
        return NextResponse.json({
          success: true,
          message: 'Zoom credentials are valid!'
        })
      } else {
        return NextResponse.json({
          success: false,
          message: 'Invalid credentials. Please check your Account ID, Client ID, and Client Secret.'
        })
      }
    } catch (error: any) {
      return NextResponse.json({
        success: false,
        message: `Connection test failed: ${error.message}`
      })
    }
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to test connection' },
      { status: 500 }
    )
  }
}

