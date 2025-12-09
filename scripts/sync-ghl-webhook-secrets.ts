/**
 * Sync GHL webhook secrets - ensure both ghlWebhookSecret and ghlMarketplaceWebhookSecret match
 * This fixes cases where one field is set but the other isn't
 */

import { PrismaClient } from '@prisma/client'
import dotenv from 'dotenv'
import { resolve } from 'path'

// Load environment variables
dotenv.config({ path: resolve(__dirname, '../.env.local') })
dotenv.config({ path: resolve(__dirname, '../.env') })

const prisma = new PrismaClient()

async function main() {
  console.log('Syncing GHL webhook secrets for all companies...\n')

  const companies = await prisma.company.findMany({
    select: {
      id: true,
      name: true,
      ghlWebhookSecret: true,
      ghlMarketplaceWebhookSecret: true
    }
  })

  console.log(`Found ${companies.length} companies\n`)

  let updatedCount = 0
  let skippedCount = 0

  for (const company of companies) {
    const oldSecret = company.ghlWebhookSecret
    const newSecret = company.ghlMarketplaceWebhookSecret
    
    // Determine which secret to use (prefer the one that exists, or use newSecret if both exist)
    const secretToUse = newSecret || oldSecret
    
    if (!secretToUse) {
      console.log(`⚠️  ${company.name} (${company.id}): No secret found - skipping`)
      skippedCount++
      continue
    }
    
    // Check if they already match
    if (oldSecret === newSecret && oldSecret) {
      console.log(`✓ ${company.name} (${company.id}): Secrets already match`)
      skippedCount++
      continue
    }
    
    // Update both fields to match
    await prisma.company.update({
      where: { id: company.id },
      data: {
        ghlWebhookSecret: secretToUse,
        ghlMarketplaceWebhookSecret: secretToUse
      }
    })
    
    console.log(`✓ ${company.name} (${company.id}): Synced secrets`)
    console.log(`  Secret: ${secretToUse.substring(0, 16)}...`)
    updatedCount++
  }

  console.log(`\nSummary:`)
  console.log(`  Updated: ${updatedCount} companies`)
  console.log(`  Skipped: ${skippedCount} companies (already synced or no secret)`)
}

main()
  .catch((error) => {
    console.error('Error:', error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })

