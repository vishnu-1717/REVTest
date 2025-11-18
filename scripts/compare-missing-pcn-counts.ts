/**
 * Compare missing PCN counts between Analytics API and Pending PCNs API
 * to understand why there's a discrepancy (134 vs 139)
 */

import { PrismaClient } from '@prisma/client'
import { getCompanyTimezone } from '@/lib/timezone'

const prisma = new PrismaClient()

async function compareMissingPCNCounts() {
  try {
    // Get company ID (assuming BudgetDog)
    const company = await prisma.company.findFirst({
      where: {
        name: { contains: 'BudgetDog', mode: 'insensitive' }
      }
    })

    if (!company) {
      console.log('❌ Company not found')
      await prisma.$disconnect()
      return
    }

    const companyId = company.id
    const timezone = getCompanyTimezone(company)
    const currentTime = new Date()
    const tenMinutesAgo = new Date(currentTime.getTime() - 10 * 60 * 1000)

    console.log('='.repeat(80))
    console.log('Comparing Missing PCN Counts')
    console.log('='.repeat(80))
    console.log(`Company: ${company.name}`)
    console.log(`Company ID: ${companyId}`)
    console.log(`Timezone: ${timezone}`)
    console.log(`Current Time: ${currentTime.toISOString()}`)
    console.log(`10 Minutes Ago: ${tenMinutesAgo.toISOString()}`)
    console.log('')

    // METHOD 1: Pending PCNs API logic
    // (This is what the dashboard shows)
    console.log('📊 METHOD 1: Pending PCNs API Logic (Dashboard)')
    console.log('   Filters: pcnSubmitted=false, status=scheduled, scheduledAt<=tenMinutesAgo')
    console.log('')

    const pendingPCNs = await prisma.appointment.findMany({
      where: {
        companyId: companyId,
        pcnSubmitted: false,
        status: 'scheduled',
        scheduledAt: {
          lte: tenMinutesAgo
        },
        AND: [
          {
            OR: [
              { appointmentInclusionFlag: 1 },
              { appointmentInclusionFlag: null }
            ]
          }
        ]
      },
      select: {
        id: true,
        scheduledAt: true,
        status: true,
        pcnSubmitted: true,
        appointmentInclusionFlag: true,
        contact: {
          select: {
            name: true
          }
        }
      }
    })

    console.log(`   Count: ${pendingPCNs.length}`)
    console.log('')

    // METHOD 2: Analytics API logic (for "this year")
    // (This is what the analytics page shows)
    console.log('📊 METHOD 2: Analytics API Logic (Analytics Page - "This Year")')
    console.log('   Filters: date range (this year), then checks if overdue')
    console.log('')

    // Get start of year
    const startOfYear = new Date()
    startOfYear.setMonth(0, 1)
    startOfYear.setHours(0, 0, 0, 0)

    const endOfYear = new Date()
    endOfYear.setMonth(11, 31)
    endOfYear.setHours(23, 59, 59, 999)

    console.log(`   Date Range: ${startOfYear.toISOString()} to ${endOfYear.toISOString()}`)
    console.log('')

    // Get all appointments in this year that match analytics filters
    const appointmentsThisYear = await prisma.appointment.findMany({
      where: {
        companyId: companyId,
        scheduledAt: {
          gte: startOfYear,
          lte: endOfYear
        },
        OR: [
          { appointmentInclusionFlag: 1 },
          { appointmentInclusionFlag: null }
        ]
      },
      select: {
        id: true,
        scheduledAt: true,
        status: true,
        pcnSubmitted: true,
        appointmentInclusionFlag: true,
        contact: {
          select: {
            name: true
          }
        }
      }
    })

    console.log(`   Total appointments this year: ${appointmentsThisYear.length}`)
    console.log('')

    // Filter to find missing PCNs using analytics logic
    // Updated to match Pending PCNs API logic (scheduled more than 10 minutes ago)
    const isPCNOverdue = (appointment: typeof appointmentsThisYear[0]): boolean => {
      // Exclude if PCN already submitted
      if (appointment.pcnSubmitted) return false
      
      // Only include appointments with status "scheduled"
      if (appointment.status !== 'scheduled') return false
      
      // Exclude appointments with flag = 0
      if (appointment.appointmentInclusionFlag === 0) return false
      
      // Check if appointment was scheduled more than 10 minutes ago
      // This matches the Pending PCNs API logic for consistency
      const scheduledDate = new Date(appointment.scheduledAt)
      const now = new Date()
      const tenMinutesAgo = new Date(now.getTime() - 10 * 60 * 1000)
      
      // If scheduled more than 10 minutes ago, it's overdue
      return scheduledDate <= tenMinutesAgo
    }

    const analyticsMissingPCNs = appointmentsThisYear.filter(isPCNOverdue)

    console.log(`   Missing PCNs (analytics logic): ${analyticsMissingPCNs.length}`)
    console.log('')

    // Find the difference
    const pendingPCNIds = new Set(pendingPCNs.map(apt => apt.id))
    const analyticsMissingPCNIds = new Set(analyticsMissingPCNs.map(apt => apt.id))

    const inPendingButNotInAnalytics = pendingPCNs.filter(apt => !analyticsMissingPCNIds.has(apt.id))
    const inAnalyticsButNotInPending = analyticsMissingPCNs.filter(apt => !pendingPCNIds.has(apt.id))

    console.log('='.repeat(80))
    console.log('📊 COMPARISON RESULTS:')
    console.log('='.repeat(80))
    console.log(`Pending PCNs API (Dashboard): ${pendingPCNs.length}`)
    console.log(`Analytics API (Analytics Page): ${analyticsMissingPCNs.length}`)
    console.log(`Difference: ${Math.abs(pendingPCNs.length - analyticsMissingPCNs.length)}`)
    console.log('')

    if (inPendingButNotInAnalytics.length > 0) {
      console.log(`📋 Appointments in Pending PCNs but NOT in Analytics (${inPendingButNotInAnalytics.length}):`)
      inPendingButNotInAnalytics.slice(0, 10).forEach((apt, index) => {
        console.log(`${index + 1}. ${apt.contact.name}`)
        console.log(`   ID: ${apt.id}`)
        console.log(`   Scheduled: ${apt.scheduledAt.toISOString()}`)
        console.log(`   Status: ${apt.status}`)
        console.log(`   PCN Submitted: ${apt.pcnSubmitted}`)
        console.log(`   Inclusion Flag: ${apt.appointmentInclusionFlag ?? 'null'}`)
        console.log('')
      })
      if (inPendingButNotInAnalytics.length > 10) {
        console.log(`   ... and ${inPendingButNotInAnalytics.length - 10} more`)
      }
    }

    if (inAnalyticsButNotInPending.length > 0) {
      console.log(`\n📋 Appointments in Analytics but NOT in Pending PCNs (${inAnalyticsButNotInPending.length}):`)
      inAnalyticsButNotInPending.slice(0, 10).forEach((apt, index) => {
        const scheduledDate = new Date(apt.scheduledAt)
        const now = new Date()
        const scheduledDay = new Date(scheduledDate.getFullYear(), scheduledDate.getMonth(), scheduledDate.getDate())
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
        const isPastDate = scheduledDay < today
        let easternHour = now.getUTCHours() - 5
        if (easternHour < 0) easternHour += 24
        const isTodayPast6PM = scheduledDay.getTime() === today.getTime() && easternHour >= 18
        const isScheduledMoreThan10MinAgo = apt.scheduledAt <= tenMinutesAgo
        
        console.log(`${index + 1}. ${apt.contact.name}`)
        console.log(`   ID: ${apt.id}`)
        console.log(`   Scheduled: ${apt.scheduledAt.toISOString()}`)
        console.log(`   Status: ${apt.status}`)
        console.log(`   PCN Submitted: ${apt.pcnSubmitted}`)
        console.log(`   Inclusion Flag: ${apt.appointmentInclusionFlag ?? 'null'}`)
        console.log(`   Is Past Date: ${isPastDate}`)
        console.log(`   Is Today: ${scheduledDay.getTime() === today.getTime()}`)
        console.log(`   Current Eastern Hour: ${easternHour}`)
        console.log(`   Is Today Past 6PM: ${isTodayPast6PM}`)
        console.log(`   Scheduled <= 10min ago: ${isScheduledMoreThan10MinAgo}`)
        console.log('')
      })
      if (inAnalyticsButNotInPending.length > 10) {
        console.log(`   ... and ${inAnalyticsButNotInPending.length - 10} more`)
      }
    } else {
      console.log('\n✅ All appointments in Analytics are also in Pending PCNs')
    }

    // Check for appointments scheduled in the future but still counted as missing
    const futureInAnalytics = analyticsMissingPCNs.filter(apt => {
      const scheduledDate = new Date(apt.scheduledAt)
      const now = new Date()
      return scheduledDate > now
    })

    if (futureInAnalytics.length > 0) {
      console.log(`⚠️  Found ${futureInAnalytics.length} appointments in Analytics missing PCNs that are scheduled in the FUTURE:`)
      futureInAnalytics.slice(0, 5).forEach((apt, index) => {
        console.log(`${index + 1}. ${apt.contact.name} - Scheduled: ${apt.scheduledAt.toISOString()}`)
      })
    }

    // Check for appointments that are past 6PM Eastern today but scheduled less than 10 minutes ago
    const todayPast6PMButRecent = analyticsMissingPCNs.filter(apt => {
      const scheduledDate = new Date(apt.scheduledAt)
      const now = new Date()
      const scheduledDay = new Date(scheduledDate.getFullYear(), scheduledDate.getMonth(), scheduledDate.getDate())
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      const isToday = scheduledDay.getTime() === today.getTime()
      const isPast6PM = (now.getUTCHours() - 5) >= 18
      const isRecent = apt.scheduledAt > tenMinutesAgo
      return isToday && isPast6PM && isRecent
    })

    if (todayPast6PMButRecent.length > 0) {
      console.log(`\n⚠️  Found ${todayPast6PMButRecent.length} appointments that are:`)
      console.log(`   - Scheduled today`)
      console.log(`   - Past 6PM Eastern (counted in Analytics)`)
      console.log(`   - But scheduled less than 10 minutes ago (NOT in Pending PCNs)`)
      todayPast6PMButRecent.slice(0, 5).forEach((apt, index) => {
        console.log(`${index + 1}. ${apt.contact.name} - Scheduled: ${apt.scheduledAt.toISOString()}`)
      })
    }

    await prisma.$disconnect()
  } catch (error: any) {
    console.error('❌ Error:', error)
    await prisma.$disconnect()
    process.exit(1)
  }
}

compareMissingPCNCounts()

