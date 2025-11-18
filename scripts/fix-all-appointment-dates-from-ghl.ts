/**
 * Fix ALL appointment scheduledAt dates by fetching correct dates from GHL API
 * 
 * This script processes ALL appointments with ghlAppointmentId and fetches
 * the correct scheduledAt from GHL API, then updates appointments if dates differ.
 */

import { PrismaClient } from '@prisma/client'
import { GHLClient } from '@/lib/ghl-api'

const prisma = new PrismaClient()

interface AppointmentToFix {
  id: string
  ghlAppointmentId: string
  companyId: string
  companyName: string
  ghlApiKey: string | null
  ghlLocationId: string | null
  currentScheduledAt: Date
  createdAt: Date
  contactName: string
  contactId: string
  ghlContactId: string | null
  status: string
}

async function getAllAppointmentsWithGHLId(): Promise<AppointmentToFix[]> {
  console.log('🔍 Finding appointments created via webhooks in the last 7 days...\n')

  // Only get appointments created in the last 7 days (webhook-created appointments)
  const oneWeekAgo = new Date()
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7)

  const appointments = await prisma.appointment.findMany({
    where: {
      ghlAppointmentId: { not: null }, // Has GHL appointment ID (created via webhook)
      createdAt: { gte: oneWeekAgo } // Created in the last 7 days
    },
    include: {
      company: {
        select: {
          id: true,
          name: true,
          ghlApiKey: true,
          ghlLocationId: true
        }
      },
      contact: {
        select: {
          id: true,
          name: true,
          ghlContactId: true
        }
      }
    },
    orderBy: {
      createdAt: 'desc'
    }
  })

  console.log(`Found ${appointments.length} webhook-created appointments in the last 7 days\n`)

  return appointments
    .map(apt => ({
      id: apt.id,
      ghlAppointmentId: apt.ghlAppointmentId!,
      companyId: apt.companyId,
      companyName: apt.company.name,
      ghlApiKey: apt.company.ghlApiKey,
      ghlLocationId: apt.company.ghlLocationId,
      currentScheduledAt: apt.scheduledAt,
      createdAt: apt.createdAt,
      contactName: apt.contact.name,
      contactId: apt.contact.id,
      ghlContactId: apt.contact.ghlContactId,
      status: apt.status
    }))
    .filter(apt => apt.ghlApiKey) // Only process appointments for companies with API keys
}

async function fetchAppointmentFromGHL(
  ghlAppointmentId: string,
  contactId: string | null,
  apiKey: string,
  locationId: string | null
): Promise<{ startTime: string | null; endTime: string | null } | null> {
  try {
    const client = new GHLClient(apiKey, locationId || undefined)
    
    // Try to fetch appointment by ID first
    const endpoints = [
      `https://rest.gohighlevel.com/v1/appointments/${ghlAppointmentId}`,
      `https://services.leadconnectorhq.com/appointments/${ghlAppointmentId}`,
    ]
    
    if (locationId) {
      endpoints.unshift(
        `https://rest.gohighlevel.com/v1/locations/${locationId}/appointments/${ghlAppointmentId}`,
        `https://services.leadconnectorhq.com/locations/${locationId}/appointments/${ghlAppointmentId}`
      )
    }

    for (const url of endpoints) {
      try {
        const response = await fetch(url, {
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Version': '2021-07-28',
            'Content-Type': 'application/json'
          }
        })

        if (response.ok) {
          const data = await response.json()
          const appointment = data.appointment || data.data || data
          
          const startTime = appointment.startTime || appointment.start_time || appointment.scheduledAt || null
          const endTime = appointment.endTime || appointment.end_time || null
          
          if (startTime) {
            return { startTime, endTime }
          }
        }
      } catch (error) {
        // Try next endpoint
        continue
      }
    }

    // Fallback: fetch appointments for the contact and find matching one
    if (contactId) {
      try {
        const appointments = await client.getContactAppointments(contactId)
        const matching = appointments.find((apt: any) => 
          apt.id === ghlAppointmentId || 
          apt.appointmentId === ghlAppointmentId ||
          apt._id === ghlAppointmentId
        )
        
        if (matching) {
          return {
            startTime: matching.startTime || matching.start_time || matching.scheduledAt || null,
            endTime: matching.endTime || matching.end_time || null
          }
        }
      } catch (error: any) {
        // Fail silently - will skip this appointment
      }
    }
    
    return null
  } catch (error: any) {
    return null
  }
}

async function fixAllAppointments() {
  try {
    const appointments = await getAllAppointmentsWithGHLId()

    if (appointments.length === 0) {
      console.log('✅ No webhook-created appointments found in the last 7 days')
      return
    }

    console.log(`🔧 Processing ${appointments.length} webhook-created appointments...\n`)
    console.log('⚠️  Processing in batches of 10 to avoid API rate limits...\n')

    let fixed = 0
    let skipped = 0
    let errors = 0
    let apiErrors = 0
    const updates: Array<{
      appointmentId: string
      contactName: string
      companyName: string
      oldScheduledAt: Date
      newScheduledAt: Date
      difference: number
    }> = []

    // Process in batches of 10 to avoid rate limits
    const batchSize = 10
    for (let i = 0; i < appointments.length; i += batchSize) {
      const batch = appointments.slice(i, i + batchSize)
      console.log(`Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(appointments.length / batchSize)} (${i + 1}-${Math.min(i + batchSize, appointments.length)} of ${appointments.length})...`)

      await Promise.all(
        batch.map(async (apt) => {
          try {
            if (!apt.ghlApiKey) {
              skipped++
              return
            }

            if (!apt.ghlContactId) {
              skipped++
              return
            }

            // Add small delay to avoid rate limits (reduced since we're only processing recent appointments)
            await new Promise(resolve => setTimeout(resolve, 100))

            const ghlData = await fetchAppointmentFromGHL(
              apt.ghlAppointmentId,
              apt.ghlContactId,
              apt.ghlApiKey,
              apt.ghlLocationId
            )

            if (!ghlData || !ghlData.startTime) {
              apiErrors++
              return
            }

            const correctScheduledAt = new Date(ghlData.startTime)
            const currentScheduledAt = apt.currentScheduledAt

            // Check if date is valid
            if (isNaN(correctScheduledAt.getTime())) {
              skipped++
              return
            }

            // Calculate time difference
            const timeDiff = Math.abs(correctScheduledAt.getTime() - currentScheduledAt.getTime())
            const hoursDiff = timeDiff / (1000 * 60 * 60)

            // Only update if difference is more than 1 hour (to avoid timezone rounding issues)
            if (hoursDiff < 1) {
              skipped++
              return
            }

            // Parse endTime if available
            let correctEndTime: Date | null = null
            if (ghlData.endTime) {
              correctEndTime = new Date(ghlData.endTime)
              if (isNaN(correctEndTime.getTime())) {
                correctEndTime = null
              }
            }

            // Update appointment
            await prisma.appointment.update({
              where: { id: apt.id },
              data: {
                scheduledAt: correctScheduledAt,
                startTime: correctScheduledAt,
                endTime: correctEndTime || undefined
              }
            })

            updates.push({
              appointmentId: apt.id,
              contactName: apt.contactName,
              companyName: apt.companyName,
              oldScheduledAt: currentScheduledAt,
              newScheduledAt: correctScheduledAt,
              difference: hoursDiff
            })

            fixed++
            console.log(`  ✅ Fixed: ${apt.contactName} (${apt.companyName}) - ${hoursDiff.toFixed(2)}h difference`)
          } catch (error: any) {
            errors++
            console.error(`  ❌ Error processing ${apt.contactName}: ${error.message}`)
          }
        })
      )

      // Add delay between batches to avoid rate limits (reduced for faster processing)
      if (i + batchSize < appointments.length) {
        await new Promise(resolve => setTimeout(resolve, 500))
      }
    }

    // Display results
    console.log('\n' + '='.repeat(80))
    console.log('📊 Summary:')
    console.log(`   Fixed: ${fixed}`)
    console.log(`   Skipped: ${skipped} (already correct or no API key/contact ID)`)
    console.log(`   API Errors: ${apiErrors} (could not fetch from GHL)`)
    console.log(`   Errors: ${errors}`)
    console.log(`   Total processed: ${appointments.length}`)
    console.log('='.repeat(80))

    if (updates.length > 0) {
      console.log('\n📋 Updated Appointments (showing top 30 by time difference):\n')
      updates
        .sort((a, b) => b.difference - a.difference)
        .slice(0, 30)
        .forEach((update, index) => {
          console.log(`${index + 1}. ${update.contactName} (${update.companyName})`)
          console.log(`   Appointment ID: ${update.appointmentId}`)
          console.log(`   Old scheduledAt: ${update.oldScheduledAt.toISOString()}`)
          console.log(`   New scheduledAt: ${update.newScheduledAt.toISOString()}`)
          console.log(`   Difference: ${update.difference.toFixed(2)} hours`)
          console.log('')
        })

      if (updates.length > 30) {
        console.log(`   ... and ${updates.length - 30} more appointments\n`)
      }
    }
  } catch (error: any) {
    console.error('❌ Fatal error:', error)
    throw error
  } finally {
    await prisma.$disconnect()
  }
}

// Run the script
fixAllAppointments()
  .then(() => {
    console.log('\n✅ Script completed successfully')
    process.exit(0)
  })
  .catch((error) => {
    console.error('\n❌ Script failed:', error)
    process.exit(1)
  })

