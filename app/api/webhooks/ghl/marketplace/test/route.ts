import { NextRequest, NextResponse } from 'next/server'

/**
 * Test endpoint to verify GHL Marketplace webhook endpoint is accessible
 * GET /api/webhooks/ghl/marketplace/test
 */
export async function GET(request: NextRequest) {
  return NextResponse.json({
    status: 'ok',
    endpoint: '/api/webhooks/ghl/marketplace',
    message: 'GHL Marketplace webhook endpoint is accessible',
    timestamp: new Date().toISOString(),
    environment: {
      hasWebhookSecret: !!process.env.GHL_MARKETPLACE_WEBHOOK_SECRET,
      webhookSecretLength: process.env.GHL_MARKETPLACE_WEBHOOK_SECRET?.length || 0
    }
  })
}

/**
 * Test POST endpoint to simulate a webhook
 * POST /api/webhooks/ghl/marketplace/test
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    
    return NextResponse.json({
      status: 'received',
      message: 'Test webhook received successfully',
      payload: body,
      timestamp: new Date().toISOString(),
      note: 'This confirms the endpoint is accessible. Check server logs for actual webhook processing.'
    })
  } catch (error: any) {
    return NextResponse.json({
      status: 'error',
      message: error.message
    }, { status: 400 })
  }
}

