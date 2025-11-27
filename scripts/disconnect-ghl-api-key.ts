/**
 * Script to disconnect legacy GHL API key for a company while keeping OAuth intact
 * Usage: npx tsx scripts/disconnect-ghl-api-key.ts <companyName>
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function disconnectApiKey(companyName: string) {
  try {
    // Find company by name (case-insensitive)
    const company = await prisma.company.findFirst({
      where: {
        name: {
          equals: companyName,
          mode: 'insensitive'
        }
      },
      select: {
        id: true,
        name: true,
        ghlApiKey: true,
        ghlLocationId: true,
        ghlOAuthAccessToken: true
      }
    })

    if (!company) {
      console.error(`❌ Company "${companyName}" not found`)
      process.exit(1)
    }

    console.log(`\n📋 Company: ${company.name} (ID: ${company.id})`)
    console.log(`   API Key: ${company.ghlApiKey ? '✅ Set' : '❌ Not set'}`)
    console.log(`   Location ID: ${company.ghlLocationId || 'Not set'}`)
    console.log(`   OAuth: ${company.ghlOAuthAccessToken ? '✅ Connected' : '❌ Not connected'}`)

    if (!company.ghlApiKey) {
      console.log(`\n⚠️  No API key to disconnect`)
      process.exit(0)
    }

    if (!company.ghlOAuthAccessToken) {
      console.log(`\n⚠️  WARNING: OAuth is not connected. Disconnecting API key will break GHL integration!`)
      console.log(`   Proceeding anyway...`)
    }

    // Clear only API key fields, keep OAuth intact
    await prisma.company.update({
      where: { id: company.id },
      data: {
        ghlApiKey: null,
        ghlLocationId: null,
        ghlWebhookSecret: null
      }
    })

    console.log(`\n✅ Successfully disconnected legacy API key`)
    console.log(`   OAuth tokens remain intact`)
    console.log(`\n📊 Updated status:`)
    const updated = await prisma.company.findUnique({
      where: { id: company.id },
      select: {
        ghlApiKey: true,
        ghlLocationId: true,
        ghlOAuthAccessToken: true
      }
    })
    console.log(`   API Key: ${updated?.ghlApiKey ? '✅ Set' : '❌ Cleared'}`)
    console.log(`   Location ID: ${updated?.ghlLocationId || 'Cleared'}`)
    console.log(`   OAuth: ${updated?.ghlOAuthAccessToken ? '✅ Connected' : '❌ Not connected'}`)

  } catch (error) {
    console.error('❌ Error:', error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

const companyName = process.argv[2]

if (!companyName) {
  console.error('Usage: npx tsx scripts/disconnect-ghl-api-key.ts <companyName>')
  console.error('Example: npx tsx scripts/disconnect-ghl-api-key.ts Budgetdog')
  process.exit(1)
}

disconnectApiKey(companyName)

