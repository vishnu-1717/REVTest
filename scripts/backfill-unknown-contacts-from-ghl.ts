import { PrismaClient } from '@prisma/client'
import * as dotenv from 'dotenv'
import * as path from 'path'
import { createGHLClient } from '@/lib/ghl-api'

// Load .env.local file (Next.js convention)
dotenv.config({ path: path.join(process.cwd(), '.env.local') })
// Also try .env as fallback
dotenv.config({ path: path.join(process.cwd(), '.env') })

const prisma = new PrismaClient()

interface BackfillStats {
  totalContacts: number
  processed: number
  updated: number
  skipped: number
  errors: number
  byCompany: Map<string, {
    companyName: string
    total: number
    updated: number
    skipped: number
    errors: number
  }>
}

async function backfillUnknownContacts() {
  console.log('🔄 Starting backfill of "Unknown" contacts from GHL API...\n')

  const stats: BackfillStats = {
    totalContacts: 0,
    processed: 0,
    updated: 0,
    skipped: 0,
    errors: 0,
    byCompany: new Map()
  }

  // Find all contacts with name "Unknown" that have ghlContactId
  const unknownContacts = await prisma.contact.findMany({
    where: {
      name: 'Unknown',
      ghlContactId: { not: null }
    },
    include: {
      company: {
        select: {
          id: true,
          name: true,
          ghlLocationId: true
        }
      }
    },
    orderBy: {
      createdAt: 'desc'
    }
  })

  stats.totalContacts = unknownContacts.length
  console.log(`📊 Found ${stats.totalContacts} "Unknown" contacts with GHL Contact IDs\n`)

  if (stats.totalContacts === 0) {
    console.log('✅ No "Unknown" contacts to backfill!')
    await prisma.$disconnect()
    return
  }

  // Group contacts by company
  const contactsByCompany = new Map<string, typeof unknownContacts>()
  for (const contact of unknownContacts) {
    const companyId = contact.companyId
    if (!contactsByCompany.has(companyId)) {
      contactsByCompany.set(companyId, [])
    }
    contactsByCompany.get(companyId)!.push(contact)
  }

  console.log(`📦 Processing ${contactsByCompany.size} companies...\n`)
  console.log('=' .repeat(80))

  // Process each company
  for (const [companyId, contacts] of contactsByCompany.entries()) {
    const company = contacts[0].company
    console.log(`\n🏢 Company: ${company.name} (${companyId})`)
    console.log(`   Contacts to process: ${contacts.length}`)

    // Initialize company stats
    if (!stats.byCompany.has(companyId)) {
      stats.byCompany.set(companyId, {
        companyName: company.name,
        total: contacts.length,
        updated: 0,
        skipped: 0,
        errors: 0
      })
    }

    // Create GHL client for this company
    let ghlClient
    try {
      ghlClient = await createGHLClient(companyId)
      if (!ghlClient) {
        console.log(`   ⚠️  Skipping: GHL not connected for this company`)
        stats.byCompany.get(companyId)!.skipped = contacts.length
        stats.skipped += contacts.length
        continue
      }
      console.log(`   ✅ GHL client created`)
    } catch (error: any) {
      console.log(`   ❌ Error creating GHL client: ${error.message}`)
      stats.byCompany.get(companyId)!.errors = contacts.length
      stats.errors += contacts.length
      continue
    }

    // Process each contact
    for (let i = 0; i < contacts.length; i++) {
      const contact = contacts[i]
      stats.processed++

      try {
        // Fetch contact from GHL API
        const ghlContact = await ghlClient.getContact(contact.ghlContactId!)

        if (!ghlContact) {
          console.log(`   ⚠️  [${i + 1}/${contacts.length}] Contact ${contact.ghlContactId} not found in GHL`)
          stats.byCompany.get(companyId)!.skipped++
          stats.skipped++
          continue
        }

        // Determine the name to use
        const name = ghlContact.name || 
                    (ghlContact.firstName && ghlContact.lastName 
                      ? `${ghlContact.firstName} ${ghlContact.lastName}`.trim()
                      : ghlContact.firstName || ghlContact.lastName || null)

        if (!name || name === 'Unknown') {
          console.log(`   ⚠️  [${i + 1}/${contacts.length}] Contact ${contact.ghlContactId} has no valid name in GHL`)
          stats.byCompany.get(companyId)!.skipped++
          stats.skipped++
          continue
        }

        // Update contact with fetched data
        const updateData: any = {
          name: name
        }

        if (ghlContact.email) {
          updateData.email = ghlContact.email
        }

        if (ghlContact.phone) {
          updateData.phone = ghlContact.phone
        }

        await prisma.contact.update({
          where: { id: contact.id },
          data: updateData
        })

        console.log(`   ✅ [${i + 1}/${contacts.length}] Updated: "${name}" ${ghlContact.email ? `(${ghlContact.email})` : ''}`)
        stats.byCompany.get(companyId)!.updated++
        stats.updated++

        // Add small delay to avoid rate limiting
        if (i < contacts.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 100)) // 100ms delay
        }

      } catch (error: any) {
        console.log(`   ❌ [${i + 1}/${contacts.length}] Error processing contact ${contact.ghlContactId}: ${error.message}`)
        stats.byCompany.get(companyId)!.errors++
        stats.errors++
      }
    }

    console.log(`   📊 Company summary: ${stats.byCompany.get(companyId)!.updated} updated, ${stats.byCompany.get(companyId)!.skipped} skipped, ${stats.byCompany.get(companyId)!.errors} errors`)
  }

  // Print final summary
  console.log('\n\n' + '=' .repeat(80))
  console.log('📊 FINAL SUMMARY\n')
  console.log('=' .repeat(80))
  console.log(`Total contacts processed: ${stats.processed}/${stats.totalContacts}`)
  console.log(`  ✅ Updated: ${stats.updated}`)
  console.log(`  ⚠️  Skipped: ${stats.skipped}`)
  console.log(`  ❌ Errors: ${stats.errors}`)
  console.log(`\nBy Company:`)
  
  for (const [companyId, companyStats] of stats.byCompany.entries()) {
    console.log(`\n  ${companyStats.companyName}:`)
    console.log(`    Total: ${companyStats.total}`)
    console.log(`    Updated: ${companyStats.updated}`)
    console.log(`    Skipped: ${companyStats.skipped}`)
    console.log(`    Errors: ${companyStats.errors}`)
  }

  console.log('\n✅ Backfill complete!')
  await prisma.$disconnect()
}

backfillUnknownContacts()
  .then(() => {
    process.exit(0)
  })
  .catch((error) => {
    console.error('Fatal error:', error)
    process.exit(1)
  })

