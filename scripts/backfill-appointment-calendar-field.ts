#!/usr/bin/env tsx

import { PrismaClient } from '@prisma/client'
import * as dotenv from 'dotenv'
import * as path from 'path'

// Load .env.local file (Next.js convention)
dotenv.config({ path: path.join(process.cwd(), '.env.local') })
// Also try .env as fallback
dotenv.config({ path: path.join(process.cwd(), '.env') })

const prisma = new PrismaClient()

async function backfillAppointmentCalendarField() {
  console.log('🔄 Starting backfill of appointment calendar field...\n')

  try {
    // Find all appointments where calendar is null but calendarRelation exists
    const appointmentsToFix = await prisma.appointment.findMany({
      where: {
        calendar: null,
        calendarRelation: {
          isNot: null
        }
      },
      include: {
        calendarRelation: {
          select: {
            id: true,
            name: true,
            ghlCalendarId: true
          }
        },
        company: {
          select: {
            id: true,
            name: true
          }
        }
      }
    })

    console.log(`📊 Found ${appointmentsToFix.length} appointments with null calendar but valid calendarRelation\n`)

    if (appointmentsToFix.length === 0) {
      console.log('✅ No appointments need backfilling. All appointments already have calendar field populated.')
      await prisma.$disconnect()
      return
    }

    // Group by company for reporting
    const byCompany = appointmentsToFix.reduce((acc, apt) => {
      const companyName = apt.company.name
      if (!acc[companyName]) {
        acc[companyName] = []
      }
      acc[companyName].push(apt)
      return acc
    }, {} as Record<string, typeof appointmentsToFix>)

    console.log('📊 Appointments to fix by company:')
    for (const [companyName, appointments] of Object.entries(byCompany)) {
      console.log(`  ${companyName}: ${appointments.length} appointments`)
    }
    console.log('')

    // Group by calendar name
    const byCalendar = appointmentsToFix.reduce((acc, apt) => {
      const calendarName = apt.calendarRelation?.name || 'Unknown'
      if (!acc[calendarName]) {
        acc[calendarName] = 0
      }
      acc[calendarName]++
      return acc
    }, {} as Record<string, number>)

    console.log('📊 Appointments to fix by calendar:')
    for (const [calendarName, count] of Object.entries(byCalendar).sort((a, b) => b[1] - a[1]).slice(0, 10)) {
      console.log(`  ${calendarName}: ${count}`)
    }
    if (Object.keys(byCalendar).length > 10) {
      console.log(`  ... and ${Object.keys(byCalendar).length - 10} more calendars`)
    }
    console.log('')

    // Update appointments
    let updated = 0
    let errors = 0
    const errorDetails: Array<{ id: string; error: string }> = []

    console.log('🔄 Updating appointments...\n')

    for (let i = 0; i < appointmentsToFix.length; i++) {
      const appointment = appointmentsToFix[i]
      const calendarName = appointment.calendarRelation?.name

      if (!calendarName) {
        console.warn(`⚠️  [${i + 1}/${appointmentsToFix.length}] Skipping appointment ${appointment.id}: calendarRelation exists but has no name`)
        errors++
        continue
      }

      try {
        await prisma.appointment.update({
          where: { id: appointment.id },
          data: {
            calendar: calendarName
          }
        })

        updated++
        if ((i + 1) % 100 === 0) {
          process.stdout.write(`\r   Progress: ${i + 1}/${appointmentsToFix.length} (${updated} updated, ${errors} errors)`)
        }
      } catch (error: any) {
        errors++
        errorDetails.push({
          id: appointment.id,
          error: error.message
        })
        if (errorDetails.length <= 10) {
          console.error(`\n❌ [${i + 1}/${appointmentsToFix.length}] Error updating appointment ${appointment.id}: ${error.message}`)
        }
      }
    }

    console.log(`\n\n✅ Backfill complete!\n`)

    // Final summary
    console.log('================================================================================')
    console.log('📊 FINAL SUMMARY')
    console.log('================================================================================')
    console.log(`Total appointments processed: ${appointmentsToFix.length}`)
    console.log(`  ✅ Updated: ${updated}`)
    console.log(`  ❌ Errors: ${errors}`)
    console.log('')

    if (errorDetails.length > 0) {
      console.log('Error details (showing first 10):')
      errorDetails.slice(0, 10).forEach(({ id, error }) => {
        console.log(`  - Appointment ${id}: ${error}`)
      })
      if (errorDetails.length > 10) {
        console.log(`  ... and ${errorDetails.length - 10} more errors`)
      }
      console.log('')
    }

    // Verify the fix
    const remainingNull = await prisma.appointment.count({
      where: {
        calendar: null,
        calendarRelation: {
          isNot: null
        }
      }
    })

    if (remainingNull === 0) {
      console.log('✅ Verification: All appointments with calendarRelation now have calendar field populated!')
    } else {
      console.log(`⚠️  Verification: ${remainingNull} appointments still have null calendar field`)
    }

  } catch (error: any) {
    console.error('❌ Fatal error during backfill:', error)
  } finally {
    await prisma.$disconnect()
  }
}

backfillAppointmentCalendarField()
  .then(() => {
    process.exit(0)
  })
  .catch((error) => {
    console.error('Fatal error:', error)
    process.exit(1)
  })

