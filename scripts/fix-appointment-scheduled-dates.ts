/**
 * Fix appointment scheduledAt dates by fetching correct dates from GHL API
 * 
 * This script identifies appointments with potentially incorrect scheduledAt dates
 * and updates them with the correct dates from GHL.
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

async function findSuspiciousAppointments(): Promise<AppointmentToFix[]> {
  console.log('🔍 Finding appointments with potentially incorrect scheduledAt dates...\n')

  // Find appointments where:
  // 1. Has ghlAppointmentId (can be fixed via API)
  // 2. scheduledAt is very close to createdAt (within 24 hours) - likely wrong
  // 3. OR scheduledAt is in the past but status is 'scheduled' (might be wrong)
  const now = new Date()
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000)

  // Get all appointments with ghlAppointmentId, then filter in memory
  // This is more flexible than trying to do complex date comparisons in Prisma
  const appointments = await prisma.appointment.findMany({
    where: {
      ghlAppointmentId: { not: null },
      createdAt: { gte: oneDayAgo } // Only check recent appointments to avoid too many
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
    take: 100 // Limit to avoid too many API calls
  })

  const suspicious: AppointmentToFix[] = appointments
    .filter(apt => {
      // Additional filtering: scheduledAt is within 12 hours of createdAt
      const timeDiff = Math.abs(apt.scheduledAt.getTime() - apt.createdAt.getTime())
      const hoursDiff = timeDiff / (1000 * 60 * 60)
      return hoursDiff < 12 || (apt.status === 'scheduled' && apt.scheduledAt < now)
    })
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

  console.log(`Found ${suspicious.length} potentially incorrect appointments\n`)
  return suspicious
}

async function fetchAppointmentFromGHL(
  ghlAppointmentId: string,
  contactId: string,
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
        console.warn(`  ⚠️  Could not fetch via contact appointments: ${error.message}`)
      }
    }
    
    return null
  } catch (error: any) {
    console.error(`  ❌ Error fetching appointment from GHL: ${error.message}`)
    return null
  }
}

async function fixAppointments() {
  try {
    const suspicious = await findSuspiciousAppointments()

    if (suspicious.length === 0) {
      console.log('✅ No suspicious appointments found. All scheduledAt dates look correct!')
      return
    }

    console.log('📋 Appointments to check:\n')
    suspicious.forEach((apt, index) => {
      const timeDiff = Math.abs(apt.currentScheduledAt.getTime() - apt.createdAt.getTime())
      const hoursDiff = timeDiff / (1000 * 60 * 60)
      console.log(`${index + 1}. ${apt.contactName} (${apt.companyName})`)
      console.log(`   Appointment ID: ${apt.ghlAppointmentId}`)
      console.log(`   Current scheduledAt: ${apt.currentScheduledAt.toISOString()}`)
      console.log(`   CreatedAt: ${apt.createdAt.toISOString()}`)
      console.log(`   Time difference: ${hoursDiff.toFixed(2)} hours`)
      console.log(`   Status: ${apt.status}`)
      console.log('')
    })

    console.log('🔧 Starting to fix appointments...\n')

    let fixed = 0
    let skipped = 0
    let errors = 0

    for (const apt of suspicious) {
      console.log(`Processing: ${apt.contactName} (${apt.ghlAppointmentId})`)

      if (!apt.ghlApiKey) {
        console.log('  ⚠️  Skipping: No GHL API key configured for company')
        skipped++
        continue
      }

      if (!apt.ghlContactId) {
        console.log('  ⚠️  Skipping: Contact has no GHL contact ID')
        skipped++
        continue
      }

      const ghlData = await fetchAppointmentFromGHL(
        apt.ghlAppointmentId,
        apt.ghlContactId,
        apt.ghlApiKey,
        apt.ghlLocationId
      )

      if (!ghlData || !ghlData.startTime) {
        console.log('  ⚠️  Skipping: Could not fetch appointment from GHL API')
        skipped++
        continue
      }

      const correctScheduledAt = new Date(ghlData.startTime)
      const currentScheduledAt = apt.currentScheduledAt

      // Check if dates are significantly different (more than 1 hour)
      const timeDiff = Math.abs(correctScheduledAt.getTime() - currentScheduledAt.getTime())
      const hoursDiff = timeDiff / (1000 * 60 * 60)

      if (hoursDiff < 1) {
        console.log(`  ✅ ScheduledAt is correct (difference: ${hoursDiff.toFixed(2)} hours)`)
        skipped++
        continue
      }

      console.log(`  🔄 Updating scheduledAt:`)
      console.log(`     From: ${currentScheduledAt.toISOString()}`)
      console.log(`     To:   ${correctScheduledAt.toISOString()}`)
      console.log(`     Difference: ${hoursDiff.toFixed(2)} hours`)

      try {
        await prisma.appointment.update({
          where: { id: apt.id },
          data: {
            scheduledAt: correctScheduledAt,
            startTime: correctScheduledAt,
            endTime: ghlData.endTime ? new Date(ghlData.endTime) : null
          }
        })

        console.log('  ✅ Fixed!')
        fixed++
      } catch (error: any) {
        console.error(`  ❌ Error updating appointment: ${error.message}`)
        errors++
      }

      console.log('')
    }

    console.log('='.repeat(60))
    console.log('📊 Summary:')
    console.log(`   Fixed: ${fixed}`)
    console.log(`   Skipped: ${skipped}`)
    console.log(`   Errors: ${errors}`)
    console.log(`   Total: ${suspicious.length}`)
    console.log('='.repeat(60))
  } catch (error: any) {
    console.error('❌ Fatal error:', error)
    throw error
  } finally {
    await prisma.$disconnect()
  }
}

// Run the script
fixAppointments()
  .then(() => {
    console.log('\n✅ Script completed successfully')
    process.exit(0)
  })
  .catch((error) => {
    console.error('\n❌ Script failed:', error)
    process.exit(1)
  })

