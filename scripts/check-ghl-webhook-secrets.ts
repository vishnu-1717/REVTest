/**
 * Check current GHL webhook secrets for all companies
 * This helps diagnose if secrets are being overwritten
 */

import { PrismaClient } from '@prisma/client'
import dotenv from 'dotenv'
import { resolve } from 'path'

// Load environment variables
dotenv.config({ path: resolve(__dirname, '../.env.local') })
dotenv.config({ path: resolve(__dirname, '../.env') })

const prisma = new PrismaClient()

async function main() {
  console.log('Checking GHL webhook secrets for all companies...\n')

  const companies = await prisma.company.findMany({
    select: {
      id: true,
      name: true,
      ghlWebhookSecret: true,
      ghlMarketplaceWebhookSecret: true,
      ghlOAuthAccessToken: true,
      ghlAppInstalledAt: true
    },
    orderBy: {
      name: 'asc'
    }
  })

  console.log(`Found ${companies.length} companies\n`)

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL 
    ? `https://${process.env.VERCEL_URL}` 
    : 'https://app.revphlo.com'

  for (const company of companies) {
    const hasOldSecret = !!company.ghlWebhookSecret
    const hasNewSecret = !!company.ghlMarketplaceWebhookSecret
    const hasOAuth = !!company.ghlOAuthAccessToken
    const secretsMatch = company.ghlWebhookSecret === company.ghlMarketplaceWebhookSecret
    
    const secret = company.ghlWebhookSecret || company.ghlMarketplaceWebhookSecret
    const webhookUrl = secret 
      ? `${baseUrl}/api/webhooks/ghl/pcn-survey?company=${company.id}&secret=${secret}`
      : 'NO SECRET'

    console.log(`${company.name} (${company.id}):`)
    console.log(`  OAuth Connected: ${hasOAuth ? 'Yes' : 'No'}`)
    console.log(`  Old Secret (ghlWebhookSecret): ${hasOldSecret ? 'Set' : 'NOT SET'}`)
    console.log(`  New Secret (ghlMarketplaceWebhookSecret): ${hasNewSecret ? 'Set' : 'NOT SET'}`)
    console.log(`  Secrets Match: ${secretsMatch ? 'Yes' : 'NO - MISMATCH!'}`)
    if (secret) {
      console.log(`  Secret (first 16 chars): ${secret.substring(0, 16)}...`)
    }
    console.log(`  Webhook URL: ${webhookUrl}`)
    console.log('')
  }

  // Summary
  const withSecrets = companies.filter(c => c.ghlWebhookSecret || c.ghlMarketplaceWebhookSecret)
  const withOAuth = companies.filter(c => c.ghlOAuthAccessToken)
  const mismatched = companies.filter(c => 
    c.ghlWebhookSecret && 
    c.ghlMarketplaceWebhookSecret && 
    c.ghlWebhookSecret !== c.ghlMarketplaceWebhookSecret
  )

  console.log('\nSummary:')
  console.log(`  Total companies: ${companies.length}`)
  console.log(`  Companies with secrets: ${withSecrets.length}`)
  console.log(`  Companies with OAuth: ${withOAuth.length}`)
  console.log(`  Companies with mismatched secrets: ${mismatched.length}`)
  
  if (mismatched.length > 0) {
    console.log('\n⚠️  WARNING: Some companies have mismatched secrets!')
    console.log('   This could cause webhook validation failures.')
  }
}

main()
  .catch((error) => {
    console.error('Error:', error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })

