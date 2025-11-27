import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { withPrisma } from '@/lib/db'
import { storeGHLOAuthTokens } from '@/lib/ghl-oauth'

/**
 * GHL OAuth callback handler
 * Note: Using /api/integrations/crm/callback instead of /api/integrations/ghl/oauth/callback
 * because GHL does not allow "ghl" in redirect URLs
 * GET /api/integrations/crm/callback
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const code = searchParams.get('code')
    const state = searchParams.get('state')
    const locationId = searchParams.get('locationId') // GHL includes locationId in callback
    const error = searchParams.get('error')

    // Handle OAuth errors from GHL redirect
    if (error) {
      const errorDescription = searchParams.get('error_description')
      const errorUri = searchParams.get('error_uri')
      
      console.error('[GHL OAuth] OAuth error from GHL redirect:', {
        error,
        errorDescription,
        errorUri,
        state,
        locationId,
        code: code ? 'present' : 'missing', // Log if code is present even with error
        allParams: Object.fromEntries(searchParams.entries()),
        fullUrl: request.url
      })
      
      // Build error message with description if available
      let errorMessage = error
      if (errorDescription) {
        errorMessage = `${error}: ${errorDescription}`
      }
      
      // Provide specific guidance for invalid_request
      if (error === 'invalid_request') {
        console.error('[GHL OAuth] Invalid request - possible causes:', {
          redirectUri: process.env.GHL_OAUTH_REDIRECT_URI || `${process.env.NEXT_PUBLIC_APP_URL}/api/integrations/crm/callback`,
          clientId: process.env.GHL_MARKETPLACE_CLIENT_ID ? 'set' : 'missing',
          clientSecret: process.env.GHL_MARKETPLACE_CLIENT_SECRET ? 'set' : 'missing',
          note: 'Check: 1) Redirect URI matches exactly in GHL app settings, 2) Client ID/Secret are correct, 3) Scopes are valid, 4) All required parameters are present'
        })
      }
      
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/admin/integrations/ghl/setup?error=${encodeURIComponent(errorMessage)}`
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
      `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/integrations/crm/callback`

    if (!clientId || !clientSecret) {
      console.error('[GHL OAuth] Missing client credentials')
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/admin/integrations/ghl/setup?error=missing_credentials`
      )
    }

    // Log the redirect URI being used for debugging
    console.log('[GHL OAuth] Token exchange request:', {
      redirectUri,
      clientId: clientId.substring(0, 10) + '...', // Log partial client ID for debugging
      hasCode: !!code,
      hasState: !!state
    })

    // Exchange code for tokens
    // GHL requires application/x-www-form-urlencoded, not JSON
    const params = new URLSearchParams()
    params.append('client_id', clientId)
    params.append('client_secret', clientSecret)
    params.append('grant_type', 'authorization_code')
    params.append('code', code)
    params.append('redirect_uri', redirectUri)
    
    const tokenResponse = await fetch('https://services.leadconnectorhq.com/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: params.toString()
    })

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text()
      let errorMessage = 'token_exchange_failed'
      
      // Try to parse error response for more details
      try {
        const errorJson = JSON.parse(errorText)
        errorMessage = errorJson.error || errorJson.message || errorMessage
        console.error(`[GHL OAuth] Token exchange failed: ${tokenResponse.status}`, {
          error: errorMessage,
          errorDescription: errorJson.error_description,
          redirectUri,
          fullError: errorJson
        })
      } catch {
        console.error(`[GHL OAuth] Token exchange failed: ${tokenResponse.status} ${errorText}`, {
          redirectUri,
          rawError: errorText
        })
      }
      
      // Include more specific error in URL if possible
      const errorParam = errorMessage.includes('redirect_uri') 
        ? 'redirect_uri_mismatch' 
        : errorMessage
      
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/admin/integrations/ghl/setup?error=${encodeURIComponent(errorParam)}&details=${encodeURIComponent(errorText.substring(0, 200))}`
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
