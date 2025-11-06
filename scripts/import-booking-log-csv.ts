import fs from 'fs'
import path from 'path'
import Papa from 'papaparse'
import { PrismaClient } from '@prisma/client'
import { withPrisma } from '../lib/db'

// Helper to parse CSV date/time strings
function parseDateTime(dateStr: string | null | undefined): Date | null {
  if (!dateStr || dateStr.trim() === '') return null
  
  const cleaned = dateStr.trim()
  
  // Try parsing as MM/DD/YYYY HH:mm:ss or MM/DD/YYYY HH:mm
  const match1 = cleaned.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/)
  if (match1) {
    const [, month, day, year, hour, minute, second] = match1
    return new Date(
      parseInt(year),
      parseInt(month) - 1,
      parseInt(day),
      parseInt(hour),
      parseInt(minute),
      second ? parseInt(second) : 0
    )
  }
  
  // Try parsing as YYYY-MM-DD HH:mm:ss or YYYY-MM-DD HH:mm
  const isoMatch = cleaned.match(/(\d{4})-(\d{2})-(\d{2})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/)
  if (isoMatch) {
    const [, year, month, day, hour, minute, second] = isoMatch
    return new Date(
      parseInt(year),
      parseInt(month) - 1,
      parseInt(day),
      parseInt(hour),
      parseInt(minute),
      second ? parseInt(second) : 0
    )
  }
  
  // Try parsing as MM/DD/YYYY (date only)
  const dateMatch = cleaned.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (dateMatch) {
    const [, month, day, year] = dateMatch
    return new Date(
      parseInt(year),
      parseInt(month) - 1,
      parseInt(day)
    )
  }
  
  // Try parsing as date only (fallback)
  const dateOnly = new Date(cleaned)
  if (!isNaN(dateOnly.getTime())) {
    return dateOnly
  }
  
  console.warn(`⚠️  Could not parse date: "${cleaned}"`)
  return null
}

async function importBookingLog() {
  try {
    const bookingLogPath = path.join(
      process.env.HOME || '',
      'Downloads',
      'Budgetdog Sales Tracker (PCN, KPI, metrics) - Booking Log.csv'
    )
    
    const pcnLogPath = path.join(
      process.env.HOME || '',
      'Downloads',
      'Budgetdog Sales Tracker (PCN, KPI, metrics) - PCN Log.csv'
    )
    
    if (!fs.existsSync(bookingLogPath)) {
      throw new Error(`Booking Log CSV not found: ${bookingLogPath}`)
    }
    
    if (!fs.existsSync(pcnLogPath)) {
      throw new Error(`PCN Log CSV not found: ${pcnLogPath}`)
    }
    
    console.log('📊 Reading Booking Log CSV...')
    const bookingLogContent = fs.readFileSync(bookingLogPath, 'utf8')
    
    console.log('📊 Reading PCN Log CSV...')
    const pcnLogContent = fs.readFileSync(pcnLogPath, 'utf8')
    
    // Parse Booking Log
    const { data: bookingData } = Papa.parse(bookingLogContent, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (header) => header.trim()
    })
    
    // Parse PCN Log
    const { data: pcnData } = Papa.parse(pcnLogContent, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (header) => header.trim()
    })
    
    console.log(`✅ Found ${bookingData.length} rows in Booking Log`)
    console.log(`✅ Found ${pcnData.length} rows in PCN Log`)
    
    // Create PCN map by Appointment ID
    const pcnMap = new Map<string, any>()
    pcnData.forEach((pcn: any) => {
      if (pcn['Appointment ID']) {
        pcnMap.set(pcn['Appointment ID'], pcn)
      }
    })
    
    await withPrisma(async (prisma) => {
      // Find BudgetDog company
      const budgetDog = await prisma.company.findFirst({
        where: { name: { contains: 'BudgetDog', mode: 'insensitive' } }
      })
      
      if (!budgetDog) {
        throw new Error('BudgetDog company not found in database')
      }
      
      console.log(`\n📦 Found company: ${budgetDog.name} (${budgetDog.id})`)
      
      // Get all existing users for email mapping
      const users = await prisma.user.findMany({
        where: { companyId: budgetDog.id }
      })
      
      const emailToUserId = new Map<string, string>()
      users.forEach(user => {
        emailToUserId.set(user.email.toLowerCase(), user.id)
      })
      
      console.log(`👥 Found ${users.length} users`)
      
      // Get all existing calendars
      const existingCalendars = await prisma.calendar.findMany({
        where: { companyId: budgetDog.id }
      })
      
      const calendarNameToId = new Map<string, string>()
      existingCalendars.forEach(cal => {
        calendarNameToId.set(cal.name.toLowerCase(), cal.id)
      })
      
      console.log(`📅 Found ${existingCalendars.length} existing calendars`)
      
      // Track statistics
      let importedAppointments = 0
      let importedContacts = 0
      let createdCalendars = 0
      let skipped = 0
      let errors = 0
      
      console.log('\n🚀 Starting import...\n')
      
      for (const row of bookingData as any[]) {
        try {
          const appointmentId = row['Appointment ID']?.trim()
          if (!appointmentId) {
            skipped++
            continue
          }
          
          // Check if appointment already exists
          const existing = await prisma.appointment.findFirst({
            where: { ghlAppointmentId: appointmentId }
          })
          
          if (existing) {
            skipped++
            continue
          }
          
          // Parse dates
          const dateCreated = parseDateTime(row['Date Created'])
          const startTime = parseDateTime(row['Start Time'])
          
          if (!startTime) {
            console.warn(`  ⚠️  Skipping ${appointmentId}: No start time`)
            skipped++
            continue
          }
          
          // Get or create contact
          const email = row['Email']?.trim()
          const phone = row['Phone']?.trim()
          const name = row['Name']?.trim() || email || phone || 'Unknown'
          
          if (!email && !phone) {
            console.warn(`  ⚠️  Skipping ${appointmentId}: No email or phone`)
            skipped++
            continue
          }
          
          let contact = await prisma.contact.findFirst({
            where: {
              companyId: budgetDog.id,
              OR: [
                email ? { email } : {},
                phone ? { phone } : {}
              ].filter(cond => Object.keys(cond).length > 0)
            }
          })
          
          if (!contact) {
            contact = await prisma.contact.create({
              data: {
                name,
                email: email || null,
                phone: phone || null,
                companyId: budgetDog.id
              }
            })
            importedContacts++
          }
          
          // Get or create closer
          const closerEmail = row['Closer']?.trim()
          if (!closerEmail) {
            console.warn(`  ⚠️  Skipping ${appointmentId}: No closer email`)
            skipped++
            continue
          }
          
          let closerId = emailToUserId.get(closerEmail.toLowerCase())
          if (!closerId) {
            // Create user if doesn't exist
            const newUser = await prisma.user.create({
              data: {
                name: closerEmail.split('@')[0],
                email: closerEmail,
                role: 'closer',
                companyId: budgetDog.id
              }
            })
            closerId = newUser.id
            emailToUserId.set(closerEmail.toLowerCase(), closerId)
          }
          
          // Get or create setter
          let setterId: string | null = null
          const setterEmail = row['Setter']?.trim()
          if (setterEmail) {
            let setterUserId = emailToUserId.get(setterEmail.toLowerCase())
            if (!setterUserId) {
              const newSetter = await prisma.user.create({
                data: {
                  name: setterEmail.split('@')[0],
                  email: setterEmail,
                  role: 'setter',
                  companyId: budgetDog.id
                }
              })
              setterUserId = newSetter.id
              emailToUserId.set(setterEmail.toLowerCase(), setterUserId)
            }
            setterId = setterUserId
          }
          
          // Handle calendar
          const calendarName = row['Calendar']?.trim()
          let calendarId: string | null = null
          
          if (calendarName) {
            const calendarKey = calendarName.toLowerCase()
            let calId = calendarNameToId.get(calendarKey)
            
            if (!calId) {
              // Create new calendar
              const newCalendar = await prisma.calendar.create({
                data: {
                  companyId: budgetDog.id,
                  ghlCalendarId: `imported-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                  name: calendarName,
                  isActive: true
                }
              })
              calId = newCalendar.id
              calendarNameToId.set(calendarKey, calId)
              createdCalendars++
            }
            
            calendarId = calId
          }
          
          // Determine status based on business logic
          const datePCNSent = row['Date PCN Sent ']?.trim()
          const dateRescheduled = row['Date Rescheduled']?.trim()
          const rescheduledTo = row['Rescheduled to']?.trim()
          const dateCancelled = row['Date Cancelled']?.trim()
          const pcnOutcome = row['PCN Outcome']?.trim()
          
          // Get PCN data if available
          const pcn = pcnMap.get(appointmentId)
          
          // Determine status and PCN completion based on business rules
          let status = 'scheduled'
          let pcnCompleted = false
          
          // Logic: If Date PCN Sent (Column J) is blank, check rescheduled/cancelled
          if (!datePCNSent || datePCNSent === '') {
            // Check rescheduled (columns L/M)
            if (dateRescheduled || rescheduledTo) {
              status = 'rescheduled'
              pcnCompleted = true
            } 
            // Check cancelled (column O)
            else if (dateCancelled) {
              status = 'cancelled'
              pcnCompleted = true
            }
            // Otherwise use PCN outcome if available
            else if (pcnOutcome) {
              if (pcnOutcome === 'Signed') status = 'signed'
              else if (pcnOutcome === 'Showed') status = 'showed'
              else if (pcnOutcome === 'No-showed') status = 'no_show'
              else if (pcnOutcome === 'Cancelled') status = 'cancelled'
            } else if (pcn && pcn['Call Outcome']) {
              // Use PCN Log outcome if available
              const outcome = pcn['Call Outcome']
              if (outcome === 'Signed') status = 'signed'
              else if (outcome === 'Showed') status = 'showed'
              else if (outcome === 'No-showed') status = 'no_show'
              else if (outcome === 'Cancelled') status = 'cancelled'
            }
          } else {
            // Column J or K has data - PCN should be submitted
            // Use outcome from either Booking Log or PCN Log
            if (pcnOutcome) {
              if (pcnOutcome === 'Signed') status = 'signed'
              else if (pcnOutcome === 'Showed') status = 'showed'
              else if (pcnOutcome === 'No-showed') status = 'no_show'
              else if (pcnOutcome === 'Cancelled') status = 'cancelled'
            } else if (pcn && pcn['Call Outcome']) {
              const outcome = pcn['Call Outcome']
              if (outcome === 'Signed') status = 'signed'
              else if (outcome === 'Showed') status = 'showed'
              else if (outcome === 'No-showed') status = 'no_show'
              else if (outcome === 'Cancelled') status = 'cancelled'
            }
          }
          
          // PCN submitted if columns J and/or K have data, and not completed
          const pcnSubmissionDate = row['PCN Submission Date']?.trim()
          const pcnSubmitted = !!(datePCNSent || pcnSubmissionDate) && !pcnCompleted
          const pcnSubmittedAt = pcnSubmitted 
            ? (pcnSubmissionDate ? parseDateTime(pcnSubmissionDate) : parseDateTime(datePCNSent))
            : null
          
          // Build appointment data
          const appointmentData: any = {
            ghlAppointmentId: appointmentId,
            companyId: budgetDog.id,
            contactId: contact.id,
            closerId,
            setterId,
            scheduledAt: startTime,
            startTime: startTime,
            createdAt: dateCreated || startTime,
            status,
            calendar: calendarName || null,
            calendarId,
            isFirstCall: row['Call Type']?.trim() === 'First Call',
            pcnSubmitted,
            pcnSubmittedAt,
            appointmentInclusionFlag: row['Appointment Inclusion Flag'] 
              ? parseInt(row['Appointment Inclusion Flag']) 
              : null
          }
          
          // Set outcome from PCN Log or Booking Log
          if (pcn && pcn['Call Outcome']) {
            appointmentData.outcome = pcn['Call Outcome']
          } else if (pcnOutcome) {
            appointmentData.outcome = pcnOutcome
          }
          
          // Store Fathom Notes if available
          const fathomNotes = row['Fathom Notes']?.trim()
          if (fathomNotes) {
            appointmentData.customFields = {
              fathomNotes
            }
          }
          
          // Add PCN fields if PCN data exists and not completed (rescheduled/cancelled)
          if (pcn && !pcnCompleted) {
            appointmentData.firstCallOrFollowUp = pcn['First Call or Follow Up'] || row['Call Type']?.trim() || null
            appointmentData.cashCollected = pcn['Cash Collected'] 
              ? parseFloat(pcn['Cash Collected']) 
              : null
            appointmentData.signedNotes = pcn['Signed Notes'] || null
            appointmentData.whyDidntMoveForward = pcn['Why Didnt the Prospect Move Forward?'] || null
            appointmentData.notes = pcn['Notes'] || null
            appointmentData.wasOfferMade = pcn['Offer Made'] === 'Yes' 
              ? true 
              : (pcn['Offer Made'] === 'No' ? false : undefined)
            appointmentData.qualificationStatus = pcn['Qualifiation Status'] || null
            appointmentData.followUpScheduled = pcn['Follow Up Scheduled'] === 'Yes' 
              ? true 
              : (pcn['Follow Up Scheduled'] === 'No' ? false : undefined)
            appointmentData.nurtureType = pcn['Nurture Type'] || null
            appointmentData.noShowCommunicative = pcn['Was the No Show Communicative?'] === 'Yes' 
              ? true 
              : (pcn['Was the No Show Communicative?'] === 'No' ? false : undefined)
            appointmentData.noShowCommunicativeNotes = pcn['Notes'] || null
            appointmentData.disqualificationReason = pcn['DQ Reason'] || null
            appointmentData.cancellationReason = pcn['Cancellation Reason'] || (dateCancelled ? 'Cancelled' : null)
            appointmentData.cancellationNotes = pcn['Cancellation Notes'] || null
          } else if (!pcnCompleted) {
            // No PCN data but not completed - still set basic fields from Booking Log
            appointmentData.firstCallOrFollowUp = row['Call Type']?.trim() || null
            if (dateCancelled) {
              appointmentData.cancellationReason = 'Cancelled'
            }
          }
          
          // Create appointment
          await prisma.appointment.create({
            data: appointmentData
          })
          
          importedAppointments++
          
          if (importedAppointments % 100 === 0) {
            console.log(`  ✅ Imported ${importedAppointments} appointments...`)
          }
          
        } catch (error: any) {
          console.error(`  ❌ Error importing appointment ${row['Appointment ID']}:`, error.message)
          errors++
        }
      }
      
      console.log('\n✨ Import complete!')
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
      console.log(`✅ Appointments imported: ${importedAppointments}`)
      console.log(`✅ Contacts created: ${importedContacts}`)
      console.log(`✅ Calendars created: ${createdCalendars}`)
      console.log(`⏭️  Skipped: ${skipped}`)
      console.log(`❌ Errors: ${errors}`)
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    })
    
  } catch (error: any) {
    console.error('❌ Import failed:', error.message)
    throw error
  }
}

importBookingLog()

