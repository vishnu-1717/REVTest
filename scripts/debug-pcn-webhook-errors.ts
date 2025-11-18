/**
 * Debug script to analyze PCN webhook errors
 * Queries webhookEvents table for pcn.survey.error events and analyzes payloads
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('Fetching PCN survey error events...\n')

  const errors = await prisma.webhookEvent.findMany({
    where: {
      processor: 'ghl',
      eventType: 'pcn.survey.error'
    },
    orderBy: {
      createdAt: 'desc'
    },
    take: 50
  })

  console.log(`Found ${errors.length} error events\n`)

  if (errors.length === 0) {
    console.log('No errors found!')
    await prisma.$disconnect()
    return
  }

  // Group errors by error message
  const errorGroups = new Map<string, { count: number; examples: any[] }>()

  errors.forEach((error) => {
    const payload = error.payload as any
    const message = payload?.message || 'Unknown error'
    
    if (!errorGroups.has(message)) {
      errorGroups.set(message, { count: 0, examples: [] })
    }
    
    const group = errorGroups.get(message)!
    group.count++
    if (group.examples.length < 3) {
      group.examples.push({
        id: error.id,
        createdAt: error.createdAt,
        payload: payload?.raw || payload,
        error: payload?.message,
        details: payload?.details,
        outcome: payload?.outcome,
        appointmentId: payload?.appointmentId
      })
    }
  })

  console.log('Error Summary:\n')
  console.log('='.repeat(80))
  
  errorGroups.forEach((group, message) => {
    console.log(`\n${message}`)
    console.log(`  Count: ${group.count}`)
    console.log(`  Examples:`)
    group.examples.forEach((example, idx) => {
      console.log(`\n  Example ${idx + 1}:`)
      console.log(`    ID: ${example.id}`)
      console.log(`    Date: ${example.createdAt}`)
      if (example.appointmentId) {
        console.log(`    Appointment ID: ${example.appointmentId}`)
      }
      if (example.outcome) {
        console.log(`    Outcome: ${example.outcome}`)
      }
      if (example.details) {
        console.log(`    Details: ${JSON.stringify(example.details, null, 2)}`)
      }
      console.log(`    Payload keys: ${Object.keys(example.payload || {}).join(', ')}`)
      
      // Show sample of payload structure
      if (example.payload) {
        const sample = JSON.stringify(example.payload, null, 2)
        if (sample.length > 500) {
          console.log(`    Payload sample (first 500 chars):\n${sample.substring(0, 500)}...`)
        } else {
          console.log(`    Payload:\n${sample}`)
        }
      }
    })
  })

  // Analyze common patterns
  console.log('\n\n' + '='.repeat(80))
  console.log('\nCommon Issues Analysis:\n')

  const missingAppointmentId = errors.filter(e => {
    const p = e.payload as any
    return p?.message?.includes('Appointment ID not found')
  })
  if (missingAppointmentId.length > 0) {
    console.log(`\nMissing Appointment ID: ${missingAppointmentId.length} errors`)
    if (missingAppointmentId.length > 0) {
      const sample = missingAppointmentId[0].payload as any
      console.log(`  Sample payload keys: ${Object.keys(sample?.raw || {}).join(', ')}`)
    }
  }

  const unsupportedOutcome = errors.filter(e => {
    const p = e.payload as any
    return p?.message?.includes('Unsupported or missing call outcome')
  })
  if (unsupportedOutcome.length > 0) {
    console.log(`\nUnsupported Outcome: ${unsupportedOutcome.length} errors`)
    const outcomes = new Map<string, number>()
    unsupportedOutcome.forEach(e => {
      const p = e.payload as any
      const outcome = p?.outcome || 'unknown'
      outcomes.set(outcome, (outcomes.get(outcome) || 0) + 1)
    })
    console.log(`  Outcomes seen:`)
    outcomes.forEach((count, outcome) => {
      console.log(`    ${outcome}: ${count}`)
    })
  }

  const submitErrors = errors.filter(e => {
    const p = e.payload as any
    return p?.message?.includes('Failed to submit PCN')
  })
  if (submitErrors.length > 0) {
    console.log(`\nSubmit PCN Errors: ${submitErrors.length} errors`)
    const details = new Map<string, number>()
    submitErrors.forEach(e => {
      const p = e.payload as any
      const detail = p?.details || 'unknown'
      details.set(detail, (details.get(detail) || 0) + 1)
    })
    console.log(`  Error details:`)
    details.forEach((count, detail) => {
      console.log(`    ${detail}: ${count}`)
    })
  }

  await prisma.$disconnect()
}

main()
  .catch((e) => {
    console.error('Error:', e)
    process.exit(1)
  })



