/**
 * Generate GHL PCN webhook secrets for all companies
 * This script generates webhook secrets for companies that don't have one
 * Run this after switching from API key to OAuth to ensure all companies have valid secrets
 */

import { PrismaClient } from '@prisma/client'
import crypto from 'crypto'
import dotenv from 'dotenv'
import { resolve } from 'path'

// Load environment variables
dotenv.config({ path: resolve(__dirname, '../.env.local') })
dotenv.config({ path: resolve(__dirname, '../.env') })

const prisma = new PrismaClient()

async function main() {
  console.log('Generating GHL PCN webhook secrets for all companies...\n')

  const companies = await prisma.company.findMany({
    select: {
      id: true,
      name: true,
      ghlWebhookSecret: true,
      ghlMarketplaceWebhookSecret: true,
      ghlOAuthAccessToken: true // Check if OAuth is connected
    }
  })

  console.log(`Found ${companies.length} companies\n`)

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL 
    ? `https://${process.env.VERCEL_URL}` 
    : 'https://app.revphlo.com'

  let updatedCount = 0
  let skippedCount = 0

  for (const company of companies) {
    const hasSecret = !!(company.ghlWebhookSecret || company.ghlMarketplaceWebhookSecret)
    const hasOAuth = !!company.ghlOAuthAccessToken

    if (hasSecret && hasOAuth) {
      console.log(`✓ ${company.name} (${company.id}): Already has webhook secret`)
      skippedCount++
      continue
    }

    // Generate new secret
    const newSecret = crypto.randomBytes(32).toString('hex')

    await prisma.company.update({
      where: { id: company.id },
      data: {
        ghlWebhookSecret: newSecret,
        ghlMarketplaceWebhookSecret: newSecret
      }
    })

    const webhookUrl = `${baseUrl}/api/webhooks/ghl/pcn-survey?company=${company.id}&secret=${newSecret}`
    
    console.log(`✓ ${company.name} (${company.id}): Generated new secret`)
    console.log(`  Webhook URL: ${webhookUrl}\n`)
    updatedCount++
  }

  console.log(`\nSummary:`)
  console.log(`  Updated: ${updatedCount} companies`)
  console.log(`  Skipped: ${skippedCount} companies (already have secrets)`)
  console.log(`\nNext steps:`)
  console.log(`  1. Update the webhook URL in GHL for each company`)
  console.log(`  2. The webhook URL format is:`)
  console.log(`     ${baseUrl}/api/webhooks/ghl/pcn-survey?company={COMPANY_ID}&secret={SECRET}`)
  console.log(`  3. You can find the webhook URL for each company by calling:`)
  console.log(`     GET /api/admin/integrations/ghl/webhook-secret?viewAs={COMPANY_ID}`)
}

main()
  .catch((error) => {
    console.error('Error:', error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })

