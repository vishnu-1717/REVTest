import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'

/**
 * Debug endpoint to check GHL OAuth configuration
 * GET /api/admin/integrations/ghl/oauth-debug
 */
export async function GET(request: NextRequest) {
  try {
    const user = await requireAdmin()
    
    const clientId = process.env.GHL_MARKETPLACE_CLIENT_ID
    const clientSecret = process.env.GHL_MARKETPLACE_CLIENT_SECRET
    const redirectUri = process.env.GHL_OAUTH_REDIRECT_URI || 
      `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/integrations/crm/callback`
    
    // Check configuration
    const config = {
      clientId: {
        present: !!clientId,
        length: clientId?.length || 0,
        preview: clientId ? `${clientId.substring(0, 10)}...` : 'missing'
      },
      clientSecret: {
        present: !!clientSecret,
        length: clientSecret?.length || 0,
        preview: clientSecret ? `${clientSecret.substring(0, 10)}...` : 'missing'
      },
      redirectUri: {
        value: redirectUri,
        fromEnv: !!process.env.GHL_OAUTH_REDIRECT_URI,
        fromDefault: !process.env.GHL_OAUTH_REDIRECT_URI
      },
      appUrl: process.env.NEXT_PUBLIC_APP_URL || 'not set',
      scopes: [
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
      ]
    }
    
    // Build what the OAuth URL would look like
    const oauthUrl = new URL('https://marketplace.gohighlevel.com/oauth/chooselocation')
    oauthUrl.searchParams.set('response_type', 'code')
    if (clientId) oauthUrl.searchParams.set('client_id', clientId)
    oauthUrl.searchParams.set('redirect_uri', redirectUri)
    oauthUrl.searchParams.set('scope', config.scopes.join(' '))
    oauthUrl.searchParams.set('state', 'test-state:test-company')
    
    return NextResponse.json({
      status: 'ok',
      configuration: config,
      oauthUrlPreview: {
        base: oauthUrl.origin + oauthUrl.pathname,
        hasClientId: oauthUrl.searchParams.has('client_id'),
        redirectUri: oauthUrl.searchParams.get('redirect_uri'),
        scopeCount: config.scopes.length,
        scopePreview: config.scopes.slice(0, 3).join(' ') + '...'
      },
      recommendations: [
        !clientId ? '❌ GHL_MARKETPLACE_CLIENT_ID is missing' : '✅ Client ID is set',
        !clientSecret ? '❌ GHL_MARKETPLACE_CLIENT_SECRET is missing' : '✅ Client Secret is set',
        !process.env.GHL_OAUTH_REDIRECT_URI ? '⚠️  Using default redirect URI (check if it matches GHL app settings)' : '✅ Redirect URI from env var',
        redirectUri.includes('localhost') ? '⚠️  Using localhost - make sure GHL app allows localhost redirects' : '✅ Using production URL'
      ]
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    )
  }
}

