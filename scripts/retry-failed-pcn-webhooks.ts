/**
 * Retry failed PCN webhook events with the new flexible handler
 * Reads failed webhook events from database and resubmits them
 */

import { PrismaClient } from '@prisma/client'
import { submitPCN } from '../lib/pcn-submission'
import { PCNSubmission } from '../types/pcn'

const prisma = new PrismaClient()

async function main() {
  console.log('Fetching failed PCN survey webhook events...\n')

  const failedEvents = await prisma.webhookEvent.findMany({
    where: {
      processor: 'ghl',
      eventType: 'pcn.survey.error'
    },
    orderBy: {
      createdAt: 'desc'
    },
    include: {
      Company: {
        select: {
          id: true,
          name: true,
          ghlWebhookSecret: true
        }
      }
    }
  })

  console.log(`Found ${failedEvents.length} failed events\n`)

  if (failedEvents.length === 0) {
    console.log('No failed events to retry!')
    await prisma.$disconnect()
    return
  }

  let successCount = 0
  let errorCount = 0
  const errors: Array<{ id: string; error: string }> = []

  for (const event of failedEvents) {
    try {
      const errorPayload = event.payload as any
      const rawPayload = errorPayload?.raw || errorPayload // The actual webhook payload
      const company = event.Company

      if (!company) {
        console.log(`⚠️  Event ${event.id}: No company found, skipping`)
        errorCount++
        errors.push({ id: event.id, error: 'No company found' })
        continue
      }

      console.log(`\n🔄 Retrying event ${event.id}...`)
      console.log(`   Company: ${company.name}`)
      console.log(`   Created: ${event.createdAt}`)

      // Extract appointment ID from error payload or raw payload
      let appointmentId = errorPayload?.appointmentId || errorPayload?.details?.appointmentId
      
      // If not in error metadata, try to extract from raw payload
      if (!appointmentId && rawPayload && typeof rawPayload === 'object') {
        appointmentId = rawPayload['PCN - Appointment ID'] || 
                       rawPayload['Call Notes - Appointment ID'] ||
                       rawPayload['appointmentId'] ||
                       rawPayload['appointment.id'] ||
                       rawPayload['Appointment ID'] ||
                       (rawPayload as any)?.appointment?.id
      }

      if (!appointmentId) {
        console.log(`   ⚠️  No appointment ID found in payload, skipping`)
        errorCount++
        errors.push({ id: event.id, error: 'No appointment ID in payload' })
        continue
      }

      // Extract outcome from error payload or raw payload
      let rawOutcome = errorPayload?.outcome || errorPayload?.details?.outcome
      
      // If not in error metadata, try to extract from raw payload
      if (!rawOutcome && rawPayload && typeof rawPayload === 'object') {
        rawOutcome = rawPayload['PCN - Call Outcome'] || 
                    rawPayload['Call Notes - Call Outcome'] ||
                    rawPayload['PCN - Call Outcome'] ||
                    rawPayload['callOutcome'] ||
                    rawPayload['Call Outcome'] ||
                    rawPayload['outcome']
      }
      
      if (!rawOutcome) {
        console.log(`   ⚠️  No outcome found in payload, skipping`)
        errorCount++
        errors.push({ id: event.id, error: 'No outcome in payload' })
        continue
      }

      // Normalize outcome
      const normalizedOutcome = String(rawOutcome).trim().toLowerCase().replace(/[_\s-]+/g, '_')
      const outcomeMap: Record<string, PCNSubmission['callOutcome']> = {
        showed: 'showed',
        show: 'showed',
        signed: 'signed',
        sale: 'signed',
        closed: 'signed',
        'no_show': 'no_show',
        'no-show': 'no_show',
        'no-showed': 'no_show',
        'no_showed': 'no_show',
        'no showed': 'no_show',
        noshow: 'no_show',
        noshowed: 'no_show',
        cancelled: 'cancelled',
        canceled: 'cancelled',
        'contract_sent': 'contract_sent',
        'contract sent': 'contract_sent'
      }

      const callOutcome = outcomeMap[normalizedOutcome] || (normalizedOutcome as PCNSubmission['callOutcome'])

      if (!['showed', 'signed', 'no_show', 'cancelled', 'contract_sent'].includes(callOutcome)) {
        console.log(`   ⚠️  Invalid outcome: ${rawOutcome}, skipping`)
        errorCount++
        errors.push({ id: event.id, error: `Invalid outcome: ${rawOutcome}` })
        continue
      }

      // Helper to extract field (simplified version)
      const getField = (key: string): string | undefined => {
        if (!rawPayload || typeof rawPayload !== 'object') return undefined
        const value = rawPayload[key] || rawPayload[key.toLowerCase()] || rawPayload[key.toUpperCase()]
        if (typeof value === 'string' && value.trim()) return value.trim()
        return undefined
      }

      // Build minimal PCN submission
      const submission: PCNSubmission = {
        callOutcome,
        notes: getField('Call notes') || getField('PCN - Fathom Notes') || getField('Call Notes - Fathom Notes') || '',
        whyDidntMoveForward: getField('PCN - Why didn\'t the prospect move forward?') || 
                            getField('Call Notes - Why didn\'t the prospect move forward?') || 
                            getField('PCN - Not Moving Forward Notes') ||
                            undefined,
        wasOfferMade: false, // Default to false if not specified
        followUpScheduled: false, // Default to false if not specified
        cashCollected: undefined,
        cancellationReason: getField('PCN - Cancellation Reason') || 
                           getField('Call Notes - Cancellation Reason') ||
                           undefined,
        noShowCommunicative: false // Default to false if not specified
      }

      // Try to extract cash collected
      const cashStr = getField('PCN - Cash Collected') || 
                     getField('Payment Amount') || 
                     getField('Charged Amount')
      if (cashStr) {
        const cashMatch = cashStr.match(/[\d.]+/)
        if (cashMatch) {
          submission.cashCollected = parseFloat(cashMatch[0])
        }
      }

      // Try to extract offer made
      const offerMadeStr = getField('PCN - Did you make an offer?') || 
                          getField('Call Notes - Did You Make An Offer?')
      if (offerMadeStr) {
        const lower = offerMadeStr.toLowerCase()
        submission.wasOfferMade = ['yes', 'true', '1', 'y'].includes(lower)
      }

      // Try to extract follow-up scheduled
      const followUpStr = getField('PCN - Was a follow up scheduled?') || 
                         getField('Call Notes - Was a Follow Up Scheduled?')
      if (followUpStr) {
        const lower = followUpStr.toLowerCase()
        submission.followUpScheduled = ['yes', 'true', '1', 'y'].includes(lower)
      }

      // Try to extract no-show communicative
      const noShowCommStr = getField('PCN - Was the no show communicative?') || 
                           getField('Call Notes - Was the no show communicative?')
      if (noShowCommStr) {
        const lower = noShowCommStr.toLowerCase()
        submission.noShowCommunicative = ['yes', 'true', '1', 'y', 'communicative'].includes(lower)
      }

      // Submit the PCN
      try {
        const result = await submitPCN({
          appointmentId: String(appointmentId),
          companyId: company.id,
          submission,
          actorUserId: null,
          actorName: 'Retry Script',
          strictValidation: false // Use non-strict validation like webhook handler
        })

        console.log(`   ✅ Success! Appointment ${result.appointment.id} updated`)
        successCount++

        // Mark the original error event as processed
        await prisma.webhookEvent.update({
          where: { id: event.id },
          data: {
            processed: true,
            processedAt: new Date(),
            error: null
          }
        })
      } catch (submitError: any) {
        console.log(`   ❌ Failed: ${submitError.message}`)
        errorCount++
        errors.push({
          id: event.id,
          error: submitError.message
        })
      }
    } catch (error: any) {
      console.log(`   ❌ Exception: ${error.message}`)
      errorCount++
      errors.push({
        id: event.id,
        error: error.message
      })
    }
  }

  console.log('\n' + '='.repeat(80))
  console.log('\nRetry Summary:')
  console.log(`  Total events: ${failedEvents.length}`)
  console.log(`  ✅ Successful: ${successCount}`)
  console.log(`  ❌ Failed: ${errorCount}`)

  if (errors.length > 0) {
    console.log('\nErrors:')
    errors.forEach(({ id, error }) => {
      console.log(`  - ${id}: ${error}`)
    })
  }

  await prisma.$disconnect()
}

main()
  .catch((e) => {
    console.error('Error:', e)
    process.exit(1)
  })

