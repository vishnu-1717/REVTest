import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { withPrisma } from '@/lib/db'
import { storeGHLOAuthTokens } from '@/lib/ghl-oauth'

/**
 * GHL OAuth callback handler
 * GET /api/integrations/ghl/oauth/callback
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const code = searchParams.get('code')
    const state = searchParams.get('state')
    const locationId = searchParams.get('locationId') // GHL includes locationId in callback
    const error = searchParams.get('error')

    // Handle OAuth errors
    if (error) {
      console.error('[GHL OAuth] OAuth error:', error)
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/admin/integrations/ghl/setup?error=${encodeURIComponent(error)}`
      )
    }

    if (!code || !state) {
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/admin/integrations/ghl/setup?error=missing_code_or_state`
      )
    }

    // Extract companyId from state (format: "state:companyId")
    const [stateToken, companyId] = state.split(':')
    if (!companyId) {
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/admin/integrations/ghl/setup?error=invalid_state`
      )
    }

    // Verify user has access to this company
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/admin/integrations/ghl/setup?error=unauthorized`
      )
    }

    await withPrisma(async (prisma) => {
      const user = await prisma.user.findFirst({
        where: { clerkId: userId },
        select: { companyId: true, superAdmin: true }
      })

      if (!user) {
        throw new Error('User not found')
      }

      if (companyId !== user.companyId && !user.superAdmin) {
        throw new Error('Access denied')
      }

      // Verify company exists
      const company = await prisma.company.findUnique({
        where: { id: companyId },
        select: { id: true, name: true }
      })

      if (!company) {
        throw new Error('Company not found')
      }

      return { companyId }
    })

    // Exchange authorization code for tokens
    const clientId = process.env.GHL_MARKETPLACE_CLIENT_ID
    const clientSecret = process.env.GHL_MARKETPLACE_CLIENT_SECRET
    const redirectUri = process.env.GHL_OAUTH_REDIRECT_URI || 
      `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/integrations/ghl/oauth/callback`

    if (!clientId || !clientSecret) {
      console.error('[GHL OAuth] Missing client credentials')
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/admin/integrations/ghl/setup?error=missing_credentials`
      )
    }

    // Exchange code for tokens
    const tokenResponse = await fetch('https://services.leadconnectorhq.com/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri
      })
    })

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text()
      console.error(`[GHL OAuth] Token exchange failed: ${tokenResponse.status} ${errorText}`)
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/admin/integrations/ghl/setup?error=token_exchange_failed`
      )
    }

    const tokenData = await tokenResponse.json()

    // Store tokens in database
    await storeGHLOAuthTokens(companyId, tokenData, locationId || undefined)

    // Store marketplace client ID
    await withPrisma(async (prisma) => {
      await prisma.company.update({
        where: { id: companyId },
        data: {
          ghlMarketplaceClientId: clientId
        }
      })
    })

    console.log(`[GHL OAuth] Successfully connected for company ${companyId}`)

    // Redirect to success page
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/admin/integrations/ghl/setup?success=true`
    )
  } catch (error: any) {
    console.error('[GHL OAuth] Callback error:', error)
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/admin/integrations/ghl/setup?error=${encodeURIComponent(error.message || 'unknown_error')}`
    )
  }
}

