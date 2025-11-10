import XLSX from 'xlsx'
import * as fs from 'fs'
import * as path from 'path'
import { PrismaClient } from '@prisma/client'
import { convertDateToUtc, getCompanyTimezone } from '../lib/timezone'

const prisma = new PrismaClient()

const filePath = path.join(process.env.HOME || '', 'Downloads', 'Budgetdog Sales Tracker (PCN, KPI, metrics) (1).xlsx')

interface BookingLogRow {
  appointmentId: string
  dateCreated: number // Excel date serial
  name: string
  email: string
  phone: number
  closer: string // Email
  startTime: number // Excel date serial
  calendar: string
  client: string
  datePCNSent: number | null
  pcnSubmissionDate: number | null
  dateRescheduled: number | null
  rescheduledTo: number | null
  previousStartTime: number | null
  dateCancelled: number | null
  pcnOutcome: string
  callType: string
  callOrder: number
  appointmentInclusionFlag: number
  expectedAppointmentInclusionFlag: number
  dealClosed: string
  offerMade: string
  setter: string
}

interface PCNLogRow {
  appointmentId: string
  date: number // Excel date serial
  closer: string // Email
  contactName: string
  phone: number
  email: string
  firstCallOrFollowUp: string
  callOutcome: string
  cashCollected: number | null
  signedNotes: string | null
  offerMade: string | null
  qualificationStatus: string | null
  followUpScheduled: string | null
  nurtureType: string | null
  cancellationReason: string | null
  client: string
  calendar: string
  appointmentStartTime: number | null
}

// Convert Excel date serial to JavaScript Date
function excelDateToJSDate(serial: number): Date {
  const utc_days = Math.floor(serial - 25569)
  const utc_value = utc_days * 86400
  return new Date(utc_value * 1000)
}

async function importData() {
  try {
    console.log('Reading Excel file...')
    const workbook = XLSX.readFile(filePath)
    
    // Get BudgetDog company
    const budgetDog = await prisma.company.findFirst({
      where: { name: { contains: 'BudgetDog', mode: 'insensitive' } }
    })
    
    if (!budgetDog) {
      throw new Error('BudgetDog company not found in database')
    }
    
    console.log(`Found BudgetDog company: ${budgetDog.id} (${budgetDog.name})`)
    const companyTimezone = getCompanyTimezone(budgetDog)
    console.log(`Using timezone: ${companyTimezone}`)
    
    // Get all users for email mapping
    const users = await prisma.user.findMany({
      where: { companyId: budgetDog.id }
    })
    
    const emailToUserId = new Map<string, string>()
    users.forEach(user => {
      emailToUserId.set(user.email.toLowerCase(), user.id)
    })
    
    console.log(`Found ${users.length} users in BudgetDog`)
    
    // Read Booking Log
    console.log('\nReading Booking Log sheet...')
    const bookingSheet = workbook.Sheets['Booking Log']
    const bookingData: BookingLogRow[] = XLSX.utils.sheet_to_json(bookingSheet, {
      header: 1,
      defval: null
    }).slice(1) // Skip header row
      .map((row: any) => ({
        appointmentId: row[0] || '',
        dateCreated: row[1] || null,
        name: row[2] || '',
        email: row[3] || '',
        phone: row[4] || null,
        closer: row[5] || '',
        startTime: row[6] || null,
        calendar: row[7] || '',
        client: row[8] || '',
        datePCNSent: row[9] || null,
        pcnSubmissionDate: row[10] || null,
        dateRescheduled: row[11] || null,
        rescheduledTo: row[12] || null,
        previousStartTime: row[13] || null,
        dateCancelled: row[14] || null,
        pcnOutcome: row[15] || '',
        callType: row[16] || '',
        callOrder: row[17] || 1,
        appointmentInclusionFlag: row[18] || 0,
        expectedAppointmentInclusionFlag: row[19] || 0,
        dealClosed: row[23] || '',
        offerMade: row[24] || '',
        setter: row[27] || ''
      }))
      .filter((row: BookingLogRow) => row.appointmentId && row.email) // Only rows with required data
    
    console.log(`Found ${bookingData.length} appointments in Booking Log`)
    
    // Read PCN Log
    console.log('\nReading PCN Log sheet...')
    const pcnSheet = workbook.Sheets['PCN Log']
    const pcnData: PCNLogRow[] = XLSX.utils.sheet_to_json(pcnSheet, {
      header: 1,
      defval: null
    }).slice(1) // Skip header row
      .map((row: any) => ({
        appointmentId: row[0] || '',
        date: row[1] || null,
        closer: row[2] || '',
        contactName: row[3] || '',
        phone: row[4] || null,
        email: row[5] || '',
        firstCallOrFollowUp: row[6] || '',
        callOutcome: row[7] || '',
        cashCollected: row[9] || null,
        signedNotes: row[10] || null,
        offerMade: row[13] || null,
        qualificationStatus: row[14] || null,
        followUpScheduled: row[15] || null,
        nurtureType: row[16] || null,
        cancellationReason: row[21] || null,
        client: row[23] || '',
        calendar: row[24] || '',
        appointmentStartTime: row[25] || null
      }))
      .filter((row: PCNLogRow) => row.appointmentId && row.email) // Only rows with required data
    
    console.log(`Found ${pcnData.length} PCN records in PCN Log`)
    
    // Create a map of appointmentId -> PCN data
    const pcnMap = new Map<string, PCNLogRow>()
    pcnData.forEach(pcn => {
      if (pcn.appointmentId) {
        pcnMap.set(pcn.appointmentId, pcn)
      }
    })
    
    // Map PCN outcome to appointment status
    function mapStatus(pcnOutcome: string, dealClosed: string): string {
      if (pcnOutcome === 'Signed') return 'signed'
      if (pcnOutcome === 'Showed') return 'showed'
      if (pcnOutcome === 'No-showed') return 'no_show'
      if (pcnOutcome === 'Cancelled') return 'cancelled'
      if (dealClosed === 'Yes') return 'signed'
      return 'scheduled'
    }
    
    // Import appointments
    console.log('\nImporting appointments...')
    let imported = 0
    let skipped = 0
    let errors = 0
    
    for (const booking of bookingData) {
      try {
        // Skip if no closer email
        if (!booking.closer) {
          skipped++
          continue
        }
        
        const closerId = emailToUserId.get(booking.closer.toLowerCase())
        if (!closerId) {
          console.warn(`  ⚠️  Skipping appointment ${booking.appointmentId}: Closer "${booking.closer}" not found`)
          skipped++
          continue
        }
        
        // Check if appointment already exists
        const existing = await prisma.appointment.findUnique({
          where: { id: booking.appointmentId }
        })
        
        if (existing) {
          console.log(`  ⏭️  Skipping existing appointment: ${booking.appointmentId}`)
          skipped++
          continue
        }
        
        // Get or create contact
        let contact = await prisma.contact.findFirst({
          where: {
            email: booking.email,
            companyId: budgetDog.id
          }
        })
        
        if (!contact) {
          contact = await prisma.contact.create({
            data: {
              email: booking.email,
              name: booking.name,
              phone: booking.phone ? String(booking.phone) : null,
              companyId: budgetDog.id
            }
          })
        }
        
        // Get PCN data if available
        const pcn = pcnMap.get(booking.appointmentId)
        
        // Determine status
        const status = mapStatus(booking.pcnOutcome || (pcn?.callOutcome || ''), booking.dealClosed || '')
        
        // Determine if PCN is submitted
        const startDate = booking.startTime ? excelDateToJSDate(booking.startTime) : null
        const startUtc = startDate ? convertDateToUtc(startDate, companyTimezone) : null
        const scheduledAt = startUtc || new Date()
        const createdDate = booking.dateCreated ? excelDateToJSDate(booking.dateCreated) : null
        const createdAt = createdDate ? convertDateToUtc(createdDate, companyTimezone) : new Date()

        const pcnSubmitted = !!(pcn || booking.pcnSubmissionDate)
        const pcnSubmissionDate = booking.pcnSubmissionDate ? excelDateToJSDate(booking.pcnSubmissionDate) : null
        const pcnSubmittedAt = pcnSubmissionDate ? convertDateToUtc(pcnSubmissionDate, companyTimezone) : null
        
        // Get setter ID if available
        let setterId: string | null = null
        if (booking.setter) {
          const setterUserId = emailToUserId.get(booking.setter.toLowerCase())
          if (setterUserId) {
            setterId = setterUserId
          }
        }
        
        // Create appointment with all PCN fields
        const appointment = await prisma.appointment.create({
          data: {
            id: booking.appointmentId,
            companyId: budgetDog.id,
            contactId: contact.id,
            closerId: closerId,
            setterId: setterId,
            scheduledAt,
            startTime: startUtc,
            createdAt,
            status: status,
            calendar: booking.calendar || null,
            isFirstCall: booking.callType === 'First Call',
            pcnSubmitted: pcnSubmitted,
            pcnSubmittedAt: pcnSubmittedAt,
            cashCollected: pcn?.cashCollected || null,
            notes: pcn?.signedNotes || null,
            // PCN specific fields
            firstCallOrFollowUp: pcn?.firstCallOrFollowUp || booking.callType || null,
            wasOfferMade: pcn?.offerMade === 'Yes' || booking.offerMade === 'Yes' ? true : (pcn?.offerMade === 'No' || booking.offerMade === 'No' ? false : undefined),
            qualificationStatus: pcn?.qualificationStatus || null,
            followUpScheduled: pcn?.followUpScheduled === 'Yes' ? true : (pcn?.followUpScheduled === 'No' ? false : undefined),
            nurtureType: pcn?.nurtureType || null,
            cancellationReason: pcn?.cancellationReason || (booking.dateCancelled ? 'Cancelled' : null),
            signedNotes: pcn?.signedNotes || null
          }
        })
        
        imported++
        if (imported % 100 === 0) {
          console.log(`  ✅ Imported ${imported} appointments...`)
        }
      } catch (error: any) {
        console.error(`  ❌ Error importing appointment ${booking.appointmentId}:`, error.message)
        errors++
      }
    }
    
    console.log(`\n✅ Import complete!`)
    console.log(`   - Imported: ${imported}`)
    console.log(`   - Skipped: ${skipped}`)
    console.log(`   - Errors: ${errors}`)
    
  } catch (error) {
    console.error('❌ Import failed:', error)
    throw error
  } finally {
    await prisma.$disconnect()
  }
}

importData()

