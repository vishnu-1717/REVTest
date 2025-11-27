/**
 * Script to restore GHL location ID for a company using OAuth
 * This fetches the location ID from GHL API and saves it
 * Usage: npx tsx scripts/restore-ghl-location-id.ts <companyName>
 */

import { PrismaClient } from '@prisma/client'
import { createGHLClient } from '../lib/ghl-api'

const prisma = new PrismaClient()

async function restoreLocationId(companyName: string) {
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
        ghlLocationId: true,
        ghlOAuthAccessToken: true
      }
    })

    if (!company) {
      console.error(`❌ Company "${companyName}" not found`)
      process.exit(1)
    }

    console.log(`\n📋 Company: ${company.name} (ID: ${company.id})`)
    console.log(`   Current Location ID: ${company.ghlLocationId || '❌ Not set'}`)
    console.log(`   OAuth: ${company.ghlOAuthAccessToken ? '✅ Connected' : '❌ Not connected'}`)

    if (!company.ghlOAuthAccessToken) {
      console.error(`\n❌ OAuth is not connected. Cannot fetch location ID.`)
      process.exit(1)
    }

    if (company.ghlLocationId) {
      console.log(`\n✅ Location ID already set: ${company.ghlLocationId}`)
      console.log(`   No action needed.`)
      process.exit(0)
    }

    // Create GHL client using OAuth
    const ghl = await createGHLClient(company.id)
    
    if (!ghl) {
      console.error(`\n❌ Failed to create GHL client`)
      process.exit(1)
    }

    console.log(`\n🔍 Fetching location information from GHL API...`)

    // Try to get location info - we'll need to try different approaches
    // First, try to get locations list
    try {
      const response = await fetch('https://rest.gohighlevel.com/v1/locations', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${await (ghl as any).getAuthToken()}`,
          'Version': '2021-07-28',
          'Content-Type': 'application/json'
        }
      })

      if (response.ok) {
        const data = await response.json()
        const locations = data.locations || data.data || []
        
        if (locations.length > 0) {
          // Use the first location (most common case)
          const locationId = locations[0].id
          console.log(`\n✅ Found location: ${locations[0].name} (ID: ${locationId})`)
          
          // Save location ID
          await prisma.company.update({
            where: { id: company.id },
            data: { ghlLocationId: locationId }
          })
          
          console.log(`\n✅ Successfully restored location ID: ${locationId}`)
          process.exit(0)
        } else {
          console.error(`\n❌ No locations found in GHL account`)
          process.exit(1)
        }
      } else {
        const errorText = await response.text()
        console.error(`\n❌ Failed to fetch locations: ${response.status} ${errorText}`)
        process.exit(1)
      }
    } catch (error: any) {
      console.error(`\n❌ Error fetching locations:`, error.message)
      process.exit(1)
    }

  } catch (error) {
    console.error('❌ Error:', error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

const companyName = process.argv[2]

if (!companyName) {
  console.error('Usage: npx tsx scripts/restore-ghl-location-id.ts <companyName>')
  console.error('Example: npx tsx scripts/restore-ghl-location-id.ts Budgetdog')
  process.exit(1)
}

restoreLocationId(companyName)

