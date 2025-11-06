/**
 * Script to recalculate appointment inclusion flags
 * 
 * Usage:
 *   npx tsx scripts/recalculate-inclusion-flags.ts [companyId]
 * 
 * If companyId is provided, only recalculates for that company.
 * Otherwise, recalculates for all companies.
 */

import { recalculateAllInclusionFlags } from '../lib/appointment-inclusion-flag'

async function main() {
  const companyId = process.argv[2] || undefined

  console.log('Starting inclusion flag recalculation...')
  if (companyId) {
    console.log(`Company ID: ${companyId}`)
  } else {
    console.log('All companies')
  }

  const startTime = Date.now()
  const result = await recalculateAllInclusionFlags(companyId)
  const duration = ((Date.now() - startTime) / 1000).toFixed(2)

  console.log('\n✅ Recalculation complete!')
  console.log(`   Total appointments: ${result.total}`)
  console.log(`   Updated: ${result.updated}`)
  console.log(`   Errors: ${result.errors}`)
  console.log(`   Duration: ${duration}s`)
  
  process.exit(0)
}

main().catch((error) => {
  console.error('Error:', error)
  process.exit(1)
})

