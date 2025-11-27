import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { withPrisma } from '@/lib/db'
import crypto from 'crypto'

/**
 * Initiate GHL OAuth flow
 * GET /api/integrations/ghl/oauth/initiate
 */
export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get company ID from query params or user's company
    const searchParams = request.nextUrl.searchParams
    const companyIdParam = searchParams.get('companyId')

    const result = await withPrisma(async (prisma) => {
      // Get user to find their company
      const user = await prisma.user.findFirst({
        where: { clerkId: userId },
        select: { companyId: true }
      })

      if (!user) {
        throw new Error('User not found')
      }

      const companyId = companyIdParam || user.companyId

      // Verify user has access to this company
      if (companyId !== user.companyId) {
        const userCompany = await prisma.user.findFirst({
          where: { clerkId: userId },
          select: { superAdmin: true }
        })
        if (!userCompany?.superAdmin) {
          throw new Error('Access denied')
        }
      }

      // Get company
      const company = await prisma.company.findUnique({
        where: { id: companyId },
        select: { id: true, name: true }
      })

      if (!company) {
        throw new Error('Company not found')
      }

      return { companyId, companyName: company.name }
    })

    // Generate OAuth state parameter (CSRF protection)
    const state = crypto.randomBytes(32).toString('hex')
    
    // Store state in session/cookie (for verification in callback)
    // In production, you might want to use Redis or a database
    // For now, we'll include it in the redirect URL and verify in callback
    
    // GHL OAuth configuration
    // Note: Using /api/integrations/crm/callback instead of /api/integrations/ghl/oauth/callback
    // because GHL does not allow "ghl" in redirect URLs
    const clientId = process.env.GHL_MARKETPLACE_CLIENT_ID
    const redirectUri = process.env.GHL_OAUTH_REDIRECT_URI || 
      `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/integrations/crm/callback`
    
    // Log redirect URI for debugging (critical - must match exactly in GHL app settings)
    console.log('[GHL OAuth] Initiating OAuth flow:', {
      redirectUri,
      clientId: clientId ? clientId.substring(0, 10) + '...' : 'missing',
      companyId: result.companyId
    })
    
    if (!clientId) {
      return NextResponse.json(
        { error: 'GHL Marketplace Client ID not configured' },
        { status: 500 }
      )
    }

    // GHL OAuth scopes (from GHL-MARKETPLACE-SETUP.md)
    // Note: Scopes must be space-separated, and some may require specific formatting
    const scopes = [
      'calendars.readonly',
      'calendars/events.readonly',
      'contacts.readonly',
      'users.readonly',
      'opportunities.readonly',
      'opportunities.write',
      'locations/customFields.readonly',
      'locations/customValues.readonly',
      'locations.readonly',
      'conversations.readonly',
      'conversations/message.readonly',
      'locations/tags.readonly'
    ].join(' ')
    
    // Log scopes for debugging
    console.log('[GHL OAuth] Scopes being requested:', scopes)

    // Build OAuth URL
    // Note: GHL Marketplace OAuth uses /oauth/chooselocation endpoint
    // The redirect_uri must be URL-encoded when added as a query parameter
    const oauthUrl = new URL('https://marketplace.gohighlevel.com/oauth/chooselocation')
    oauthUrl.searchParams.set('response_type', 'code')
    oauthUrl.searchParams.set('client_id', clientId)
    // Ensure redirect_uri is properly encoded (URL.searchParams handles this automatically)
    oauthUrl.searchParams.set('redirect_uri', redirectUri)
    oauthUrl.searchParams.set('scope', scopes)
    oauthUrl.searchParams.set('state', `${state}:${result.companyId}`) // Include companyId in state

    // Log the final OAuth URL for debugging (without sensitive data)
    console.log('[GHL OAuth] Final OAuth URL:', {
      base: oauthUrl.origin + oauthUrl.pathname,
      hasClientId: !!oauthUrl.searchParams.get('client_id'),
      redirectUri: oauthUrl.searchParams.get('redirect_uri'),
      hasState: !!oauthUrl.searchParams.get('state'),
      hasScope: !!oauthUrl.searchParams.get('scope')
    })

    // Store state temporarily (in production, use Redis or database)
    // For now, we'll verify it in the callback using the state parameter

    return NextResponse.redirect(oauthUrl.toString())
  } catch (error: any) {
    console.error('[GHL OAuth] Initiation error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to initiate OAuth flow' },
      { status: 500 }
    )
  }
}

