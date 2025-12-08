#!/usr/bin/env tsx

import { PrismaClient } from '@prisma/client'
import * as dotenv from 'dotenv'
import * as path from 'path'

// Load .env.local file (Next.js convention)
dotenv.config({ path: path.join(process.cwd(), '.env.local') })
// Also try .env as fallback
dotenv.config({ path: path.join(process.cwd(), '.env') })

const prisma = new PrismaClient()

async function analyzeUnknownCalendarAppointments() {
  try {
    console.log('🔍 Analyzing appointments with "Unknown" calendar...\n')

    // Find appointments where calendar is "Unknown" or null (UI may display null as "Unknown")
    // Also check calendarRelation with "Unknown" name
    const unknownCalendarAppointments = await prisma.appointment.findMany({
      where: {
        OR: [
          { calendar: 'Unknown' },
          { calendar: null },
          { calendarRelation: { name: 'Unknown' } },
          { calendarRelation: null, calendarId: { not: null } } // Has calendarId but relation is null (deleted calendar)
        ]
      },
      include: {
        contact: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            ghlContactId: true
          }
        },
        closer: {
          select: {
            id: true,
            name: true,
            email: true
          }
        },
        setter: {
          select: {
            id: true,
            name: true,
            email: true
          }
        },
        calendarRelation: {
          select: {
            id: true,
            name: true,
            ghlCalendarId: true,
            calendarType: true,
            trafficSource: true
          }
        },
        company: {
          select: {
            id: true,
            name: true
          }
        }
      },
      orderBy: {
        scheduledAt: 'desc'
      }
    })

    console.log(`📊 Total appointments with "Unknown" calendar: ${unknownCalendarAppointments.length}\n`)

    if (unknownCalendarAppointments.length === 0) {
      console.log('✅ No appointments found with "Unknown" calendar.')
      await prisma.$disconnect()
      return
    }

    // Analyze commonalities
    console.log('📈 Analyzing patterns and commonalities...\n')

    // Group by company
    const byCompany = unknownCalendarAppointments.reduce((acc, apt) => {
      const companyName = apt.company.name
      if (!acc[companyName]) {
        acc[companyName] = []
      }
      acc[companyName].push(apt)
      return acc
    }, {} as Record<string, typeof unknownCalendarAppointments>)

    console.log('📊 By Company:')
    for (const [companyName, appointments] of Object.entries(byCompany)) {
      console.log(`  ${companyName}: ${appointments.length} appointments`)
    }
    console.log('')

    // Group by status
    const byStatus = unknownCalendarAppointments.reduce((acc, apt) => {
      const status = apt.status || 'null'
      if (!acc[status]) {
        acc[status] = 0
      }
      acc[status]++
      return acc
    }, {} as Record<string, number>)

    console.log('📊 By Status:')
    for (const [status, count] of Object.entries(byStatus).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${status}: ${count}`)
    }
    console.log('')

    // Group by outcome
    const byOutcome = unknownCalendarAppointments.reduce((acc, apt) => {
      const outcome = apt.outcome || 'null'
      if (!acc[outcome]) {
        acc[outcome] = 0
      }
      acc[outcome]++
      return acc
    }, {} as Record<string, number>)

    console.log('📊 By Outcome:')
    for (const [outcome, count] of Object.entries(byOutcome).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${outcome}: ${count}`)
    }
    console.log('')

    // Check if they have calendarId but calendarRelation is null
    const withCalendarIdButNoRelation = unknownCalendarAppointments.filter(
      apt => apt.calendarId && !apt.calendarRelation
    )
    console.log(`📊 Appointments with calendarId but no calendarRelation: ${withCalendarIdButNoRelation.length}`)
    if (withCalendarIdButNoRelation.length > 0) {
      console.log('  ⚠️  These appointments have a calendarId but the calendarRelation is null (calendar may have been deleted)')
    }
    console.log('')

    // Check if they have ghlAppointmentId
    const withGHLAppointmentId = unknownCalendarAppointments.filter(apt => apt.ghlAppointmentId)
    console.log(`📊 Appointments with ghlAppointmentId: ${withGHLAppointmentId.length} (${((withGHLAppointmentId.length / unknownCalendarAppointments.length) * 100).toFixed(1)}%)`)
    console.log('')

    // Group by date range
    const now = new Date()
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    const threeMonthsAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)

    const recent = unknownCalendarAppointments.filter(apt => apt.scheduledAt >= oneWeekAgo).length
    const lastMonth = unknownCalendarAppointments.filter(apt => apt.scheduledAt >= oneMonthAgo && apt.scheduledAt < oneWeekAgo).length
    const last3Months = unknownCalendarAppointments.filter(apt => apt.scheduledAt >= threeMonthsAgo && apt.scheduledAt < oneMonthAgo).length
    const older = unknownCalendarAppointments.filter(apt => apt.scheduledAt < threeMonthsAgo).length

    console.log('📊 By Date Range:')
    console.log(`  Last 7 days: ${recent}`)
    console.log(`  1-4 weeks ago: ${lastMonth}`)
    console.log(`  1-3 months ago: ${last3Months}`)
    console.log(`  Older than 3 months: ${older}`)
    console.log('')

    // Check if contacts are "Unknown"
    const withUnknownContact = unknownCalendarAppointments.filter(
      apt => apt.contact?.name === 'Unknown'
    )
    console.log(`📊 Appointments with "Unknown" contact: ${withUnknownContact.length} (${((withUnknownContact.length / unknownCalendarAppointments.length) * 100).toFixed(1)}%)`)
    console.log('')

    // Check closer assignment
    const withCloser = unknownCalendarAppointments.filter(apt => apt.closerId)
    const withoutCloser = unknownCalendarAppointments.filter(apt => !apt.closerId)
    console.log(`📊 Closer Assignment:`)
    console.log(`  With closer: ${withCloser.length} (${((withCloser.length / unknownCalendarAppointments.length) * 100).toFixed(1)}%)`)
    console.log(`  Without closer: ${withoutCloser.length} (${((withoutCloser.length / unknownCalendarAppointments.length) * 100).toFixed(1)}%)`)
    console.log('')

    // Sample of recent appointments
    console.log('📋 Sample of 10 most recent appointments:')
    console.log('')
    unknownCalendarAppointments.slice(0, 10).forEach((apt, idx) => {
      console.log(`${idx + 1}. ${apt.contact?.name || 'Unknown Contact'} - ${apt.scheduledAt.toISOString().split('T')[0]}`)
      console.log(`   Status: ${apt.status}, Outcome: ${apt.outcome || 'N/A'}`)
      console.log(`   Calendar field: "${apt.calendar || 'null'}", CalendarId: ${apt.calendarId || 'null'}`)
      console.log(`   CalendarRelation: ${apt.calendarRelation ? apt.calendarRelation.name : 'null'}`)
      console.log(`   GHL Appointment ID: ${apt.ghlAppointmentId || 'N/A'}`)
      console.log(`   Closer: ${apt.closer?.name || 'N/A'}`)
      console.log('')
    })

    // Check if old calendar field is set vs new calendarRelation
    const usingOldField = unknownCalendarAppointments.filter(apt => apt.calendar === 'Unknown').length
    const usingNewRelation = unknownCalendarAppointments.filter(apt => apt.calendarRelation?.name === 'Unknown').length
    const usingBoth = unknownCalendarAppointments.filter(apt => apt.calendar === 'Unknown' && apt.calendarRelation?.name === 'Unknown').length
    const nullOldButHasRelation = unknownCalendarAppointments.filter(apt => !apt.calendar && apt.calendarRelation).length

    console.log('📊 Calendar Field Usage:')
    console.log(`  Using old "calendar" field: ${usingOldField}`)
    console.log(`  Using new "calendarRelation": ${usingNewRelation}`)
    console.log(`  Using both: ${usingBoth}`)
    console.log(`  ⚠️  NULL old field but HAS calendarRelation: ${nullOldButHasRelation} (data migration issue)`)
    console.log('')

    // Group by actual calendar name from calendarRelation
    const byActualCalendar = unknownCalendarAppointments.reduce((acc, apt) => {
      const calendarName = apt.calendarRelation?.name || 'No Calendar Relation'
      if (!acc[calendarName]) {
        acc[calendarName] = 0
      }
      acc[calendarName]++
      return acc
    }, {} as Record<string, number>)

    console.log('📊 By Actual Calendar (from calendarRelation):')
    for (const [calendarName, count] of Object.entries(byActualCalendar).sort((a, b) => b[1] - a[1]).slice(0, 10)) {
      console.log(`  ${calendarName}: ${count}`)
    }
    if (Object.keys(byActualCalendar).length > 10) {
      console.log(`  ... and ${Object.keys(byActualCalendar).length - 10} more calendars`)
    }
    console.log('')

  } catch (error: any) {
    console.error('❌ Error analyzing appointments:', error)
  } finally {
    await prisma.$disconnect()
  }
}

analyzeUnknownCalendarAppointments()
  .then(() => {
    process.exit(0)
  })
  .catch((error) => {
    console.error('Fatal error:', error)
    process.exit(1)
  })

