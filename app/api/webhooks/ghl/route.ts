import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

/**
 * Legacy GHL Webhook Endpoint (Deprecated)
 * This endpoint has been replaced by /api/webhooks/ghl/marketplace
 */
export async function POST(request: NextRequest) {
  return NextResponse.json(
    {
      error: 'This endpoint is deprecated',
      message: 'Please update your webhook URL to /api/webhooks/ghl/marketplace',
      newEndpoint: '/api/webhooks/ghl/marketplace'
    },
    {
      status: 410, // Gone - resource permanently removed
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    }
  )
}

export async function GET(request: NextRequest) {
  return NextResponse.json(
    {
      status: 'deprecated',
      message: 'This endpoint is deprecated. Use /api/webhooks/ghl/marketplace instead'
    },
    {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0'
      }
    }
  )
}

