import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { getEffectiveCompanyId } from '@/lib/company-context'
import { withPrisma } from '@/lib/db'
import crypto from 'crypto'

/**
 * Generate or retrieve GHL webhook secret for PCN survey webhooks
 * GET /api/admin/integrations/ghl/webhook-secret - Get current webhook URL and secret
 * POST /api/admin/integrations/ghl/webhook-secret - Generate new webhook secret
 */
export async function GET(request: NextRequest) {
  try {
    await requireAdmin()
    const companyId = await getEffectiveCompanyId(request.url)
    
    if (!companyId) {
      return NextResponse.json({ error: 'Company not found' }, { status: 400 })
    }

    const result = await withPrisma(async (prisma) => {
      const company = await prisma.company.findUnique({
        where: { id: companyId },
        select: {
          id: true,
          name: true,
          ghlWebhookSecret: true,
          ghlMarketplaceWebhookSecret: true
        }
      })

      if (!company) {
        return { error: 'Company not found' }
      }

      const secret = company.ghlWebhookSecret || company.ghlMarketplaceWebhookSecret
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL 
        ? `https://${process.env.VERCEL_URL}` 
        : 'https://app.revphlo.com'
      
      const webhookUrl = secret 
        ? `${baseUrl}/api/webhooks/ghl/pcn-survey?company=${companyId}&secret=${secret}`
        : null

      return {
        companyId: company.id,
        companyName: company.name,
        hasSecret: !!secret,
        webhookUrl,
        baseUrl
      }
    })

    if ('error' in result) {
      return NextResponse.json(result, { status: 404 })
    }

    return NextResponse.json(result)
  } catch (error: any) {
    console.error('[GHL Webhook Secret] Error:', error)
    return NextResponse.json(
      { error: 'Failed to retrieve webhook secret', details: error.message },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireAdmin()
    const companyId = await getEffectiveCompanyId(request.url)
    
    if (!companyId) {
      return NextResponse.json({ error: 'Company not found' }, { status: 400 })
    }

    // Generate a secure random secret
    const newSecret = crypto.randomBytes(32).toString('hex')

    const result = await withPrisma(async (prisma) => {
      const company = await prisma.company.findUnique({
        where: { id: companyId },
        select: { id: true, name: true }
      })

      if (!company) {
        return { error: 'Company not found' }
      }

      // Update both fields for backward compatibility
      await prisma.company.update({
        where: { id: companyId },
        data: {
          ghlWebhookSecret: newSecret,
          // Also update marketplace secret if it doesn't exist
          ghlMarketplaceWebhookSecret: newSecret
        }
      })

      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL 
        ? `https://${process.env.VERCEL_URL}` 
        : 'https://app.revphlo.com'
      
      const webhookUrl = `${baseUrl}/api/webhooks/ghl/pcn-survey?company=${companyId}&secret=${newSecret}`

      return {
        companyId: company.id,
        companyName: company.name,
        secret: newSecret,
        webhookUrl,
        baseUrl,
        message: 'Webhook secret generated successfully. Update the webhook URL in GHL with the new URL.'
      }
    })

    if ('error' in result) {
      return NextResponse.json(result, { status: 404 })
    }

    return NextResponse.json(result)
  } catch (error: any) {
    console.error('[GHL Webhook Secret] Error generating secret:', error)
    return NextResponse.json(
      { error: 'Failed to generate webhook secret', details: error.message },
      { status: 500 }
    )
  }
}

