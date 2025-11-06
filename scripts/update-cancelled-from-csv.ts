import { PrismaClient } from '@prisma/client'
import * as fs from 'fs'
import * as path from 'path'

const prisma = new PrismaClient()

interface CSVRow {
  appointmentId: string
  dateCancelled: string
  name: string
  email: string
  phone: string
  startTime: string
}

async function updateCancelledFromCSV() {
  try {
    const csvPath = path.join(process.env.HOME || '', 'Downloads', 'Budgetdog Sales Tracker (PCN, KPI, metrics) - Booking Log.csv')
    
    console.log(`📖 Reading CSV file: ${csvPath}`)
    
    if (!fs.existsSync(csvPath)) {
      throw new Error(`CSV file not found at: ${csvPath}`)
    }
    
    const csvContent = fs.readFileSync(csvPath, 'utf-8')
    const lines = csvContent.split('\n')
    
    console.log(`📊 Total lines in CSV: ${lines.length}`)
    
    // Parse CSV - column O is the 15th column (index 14)
    // Column A (Appointment ID) is index 0
    const cancelledAppointments: CSVRow[] = []
    
    // Skip header row (index 0)
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim()
      if (!line) continue
      
      // Parse CSV - handle quoted fields
      const columns = parseCSVLine(line)
      
      if (columns.length < 15) continue
      
      const appointmentId = columns[0]?.trim()
      const dateCancelled = columns[14]?.trim() // Column O (index 14)
      const name = columns[2]?.trim() || ''
      const email = columns[3]?.trim() || ''
      const phone = columns[4]?.trim() || ''
      const startTime = columns[6]?.trim() || ''
      
      // Only include rows where Date Cancelled is filled
      if (dateCancelled && appointmentId) {
        cancelledAppointments.push({
          appointmentId,
          dateCancelled,
          name,
          email,
          phone,
          startTime
        })
      }
    }
    
    console.log(`\n✅ Found ${cancelledAppointments.length} appointments with Date Cancelled filled`)
    
    if (cancelledAppointments.length === 0) {
      console.log('No cancelled appointments found in CSV')
      return
    }
    
    // Show sample
    console.log('\n📋 Sample cancelled appointments from CSV:')
    cancelledAppointments.slice(0, 10).forEach(apt => {
      console.log(`  - ${apt.name} (${apt.appointmentId}) | Cancelled: ${apt.dateCancelled}`)
    })
    
    if (cancelledAppointments.length > 10) {
      console.log(`  ... and ${cancelledAppointments.length - 10} more`)
    }
    
    // Match appointments in database - try multiple methods
    console.log('\n🔍 Matching appointments in database...')
    
    const appointmentIds = cancelledAppointments.map(a => a.appointmentId)
    
    // Define a consistent type for all matched appointments
    type MatchedAppointment = {
      id: string
      ghlAppointmentId: string | null
      status: string
      pcnSubmitted: boolean
      scheduledAt: Date
      contact: {
        name: string
        email: string | null
        phone: string | null
      }
    }

    // First, try matching by ghlAppointmentId
    const matchedByGhlId: MatchedAppointment[] = await prisma.appointment.findMany({
      where: {
        ghlAppointmentId: {
          in: appointmentIds
        }
      },
      select: {
        id: true,
        ghlAppointmentId: true,
        status: true,
        pcnSubmitted: true,
        scheduledAt: true,
        contact: {
          select: {
            name: true,
            email: true,
            phone: true
          }
        }
      }
    })
    
    console.log(`📊 Matched by ghlAppointmentId: ${matchedByGhlId.length}`)
    
    // Also try matching by email and date for unmatched appointments
    const unmatchedIds = appointmentIds.filter(id => !matchedByGhlId.some(a => a.ghlAppointmentId === id))
    const unmatchedFromCSV = cancelledAppointments.filter(c => unmatchedIds.includes(c.appointmentId))
    
    console.log(`🔍 Trying to match ${unmatchedFromCSV.length} unmatched appointments by email and date...`)
    
    const matchedByEmail: MatchedAppointment[] = []
    const processedIds = new Set(matchedByGhlId.map(a => a.id))
    
    for (const csvAppt of unmatchedFromCSV) {
      if (!csvAppt.email || !csvAppt.startTime) continue
      
      // Parse the start time from CSV
      const startTime = new Date(csvAppt.startTime)
      if (isNaN(startTime.getTime())) continue
      
      // Find appointments by email and scheduled date (within same day)
      const startOfDay = new Date(startTime)
      startOfDay.setHours(0, 0, 0, 0)
      const endOfDay = new Date(startTime)
      endOfDay.setHours(23, 59, 59, 999)
      
      const matches = await prisma.appointment.findMany({
        where: {
          contact: {
            email: {
              equals: csvAppt.email,
              mode: 'insensitive'
            }
          },
          scheduledAt: {
            gte: startOfDay,
            lte: endOfDay
          },
          id: {
            notIn: Array.from(processedIds)
          }
        },
        select: {
          id: true,
          ghlAppointmentId: true,
          status: true,
          pcnSubmitted: true,
          scheduledAt: true,
          contact: {
            select: {
              name: true,
              email: true,
              phone: true
            }
          }
        },
        take: 1
      })
      
      if (matches.length > 0) {
        matchedByEmail.push(matches[0])
        processedIds.add(matches[0].id)
      }
    }
    
    console.log(`📊 Matched by email and date: ${matchedByEmail.length}`)
    
    // Try matching by phone number and date for remaining unmatched
    const unmatchedAfterEmail = unmatchedFromCSV.filter(csvAppt => {
      const matched = matchedByEmail.some(m => {
        const csvEmail = csvAppt.email?.toLowerCase()
        const dbEmail = m.contact.email?.toLowerCase()
        return csvEmail && dbEmail && csvEmail === dbEmail
      })
      return !matched
    })
    
    console.log(`🔍 Trying to match ${unmatchedAfterEmail.length} unmatched appointments by phone and date...`)
    
    const matchedByPhone: MatchedAppointment[] = []
    
    for (const csvAppt of unmatchedAfterEmail) {
      if (!csvAppt.phone || !csvAppt.startTime) continue
      
      // Normalize phone number (remove non-digits)
      const normalizedPhone = csvAppt.phone.replace(/\D/g, '')
      if (normalizedPhone.length < 10) continue
      
      // Parse the start time from CSV
      const startTime = new Date(csvAppt.startTime)
      if (isNaN(startTime.getTime())) continue
      
      // Find appointments by phone and scheduled date (within same day)
      const startOfDay = new Date(startTime)
      startOfDay.setHours(0, 0, 0, 0)
      const endOfDay = new Date(startTime)
      endOfDay.setHours(23, 59, 59, 999)
      
      // Match by phone - try exact match and last 10 digits
      // First try exact normalized phone match
      let matches = await prisma.appointment.findMany({
        where: {
          contact: {
            phone: {
              contains: normalizedPhone.slice(-10) // Match last 10 digits
            }
          },
          scheduledAt: {
            gte: startOfDay,
            lte: endOfDay
          },
          id: {
            notIn: Array.from(processedIds)
          }
        },
        select: {
          id: true,
          ghlAppointmentId: true,
          status: true,
          pcnSubmitted: true,
          scheduledAt: true,
          contact: {
            select: {
              name: true,
              email: true,
              phone: true
            }
          }
        },
        take: 1
      })
      
      // If no match, try with full phone number
      if (matches.length === 0) {
        matches = await prisma.appointment.findMany({
          where: {
            contact: {
              phone: {
                contains: normalizedPhone
              }
            },
            scheduledAt: {
              gte: startOfDay,
              lte: endOfDay
            },
            id: {
              notIn: Array.from(processedIds)
            }
          },
          select: {
            id: true,
            ghlAppointmentId: true,
            status: true,
            pcnSubmitted: true,
            scheduledAt: true,
            contact: {
              select: {
                name: true,
                email: true,
                phone: true
              }
            }
          },
          take: 1
        })
      }
      
      if (matches.length > 0) {
        matchedByPhone.push(matches[0])
        processedIds.add(matches[0].id)
      }
    }
    
    console.log(`📊 Matched by phone and date: ${matchedByPhone.length}`)
    
    // Try matching by name and date for remaining unmatched
    const unmatchedAfterPhone = unmatchedAfterEmail.filter(csvAppt => {
      const matched = matchedByPhone.some(m => {
        const csvPhone = csvAppt.phone?.replace(/\D/g, '')
        const dbPhone = m.contact.phone?.replace(/\D/g, '')
        return csvPhone && dbPhone && 
               (csvPhone.slice(-10) === dbPhone.slice(-10) || csvPhone === dbPhone)
      })
      return !matched
    })
    
    console.log(`🔍 Trying to match ${unmatchedAfterPhone.length} unmatched appointments by name and date...`)
    
    const matchedByName: MatchedAppointment[] = []
    
    for (const csvAppt of unmatchedAfterPhone) {
      if (!csvAppt.name || !csvAppt.startTime) continue
      
      // Normalize name (lowercase, remove extra spaces)
      const normalizedName = csvAppt.name.toLowerCase().trim().replace(/\s+/g, ' ')
      if (normalizedName.length < 3) continue
      
      // Parse the start time from CSV
      const startTime = new Date(csvAppt.startTime)
      if (isNaN(startTime.getTime())) continue
      
      // Find appointments by name and scheduled date (within same day)
      const startOfDay = new Date(startTime)
      startOfDay.setHours(0, 0, 0, 0)
      const endOfDay = new Date(startTime)
      endOfDay.setHours(23, 59, 59, 999)
      
      const matches = await prisma.appointment.findMany({
        where: {
          contact: {
            name: {
              mode: 'insensitive',
              contains: normalizedName.split(' ')[0] // Try matching first name
            }
          },
          scheduledAt: {
            gte: startOfDay,
            lte: endOfDay
          },
          id: {
            notIn: Array.from(processedIds)
          }
        },
        select: {
          id: true,
          ghlAppointmentId: true,
          status: true,
          pcnSubmitted: true,
          scheduledAt: true,
          contact: {
            select: {
              name: true,
              email: true,
              phone: true
            }
          }
        },
        take: 1
      })
      
      // Filter to ensure name similarity (fuzzy match)
      const filteredMatches = matches.filter(m => {
        const dbName = m.contact.name.toLowerCase().trim().replace(/\s+/g, ' ')
        // Check if names are similar (at least 60% match)
        const nameSimilarity = calculateSimilarity(normalizedName, dbName)
        return nameSimilarity > 0.6
      })
      
      if (filteredMatches.length > 0) {
        matchedByName.push(filteredMatches[0])
        processedIds.add(filteredMatches[0].id)
      }
    }
    
    console.log(`📊 Matched by name and date: ${matchedByName.length}`)
    
    // Combine all matches
    const allMatches = [...matchedByGhlId, ...matchedByEmail, ...matchedByPhone, ...matchedByName]
    
    console.log(`\n📊 Total matched appointments: ${allMatches.length}`)
    
    // Show matches
    console.log('\n📋 Matched appointments:')
    allMatches.slice(0, 20).forEach(apt => {
      const csvAppt = cancelledAppointments.find(c => 
        c.appointmentId === apt.ghlAppointmentId || 
        (c.email && apt.contact.email && c.email.toLowerCase() === apt.contact.email.toLowerCase())
      )
      console.log(`  - ${apt.contact.name} (${apt.ghlAppointmentId || 'no GHL ID'}) | Current Status: ${apt.status} | PCN Submitted: ${apt.pcnSubmitted}`)
      if (csvAppt) {
        console.log(`    CSV: Cancelled on ${csvAppt.dateCancelled}`)
      }
    })
    
    if (allMatches.length > 20) {
      console.log(`  ... and ${allMatches.length - 20} more`)
    }
    
    // Check how many are already cancelled
    const alreadyCancelled = allMatches.filter(a => a.status === 'cancelled').length
    console.log(`\n📊 Already cancelled: ${alreadyCancelled}`)
    console.log(`📊 Need to update: ${allMatches.length - alreadyCancelled}`)
    
    // Update appointments
    if (allMatches.length > 0) {
      console.log('\n🔄 Updating appointments to cancelled status and marking PCN as submitted...')
      
      const idsToUpdate = allMatches.map(a => a.id)
      
      const updateResult = await prisma.appointment.updateMany({
        where: {
          id: {
            in: idsToUpdate
          }
        },
        data: {
          status: 'cancelled',
          outcome: 'Cancelled',
          pcnSubmitted: true,
          pcnSubmittedAt: new Date()
        }
      })
      
      console.log(`✅ Successfully updated ${updateResult.count} appointments`)
      console.log(`   - Status set to 'cancelled'`)
      console.log(`   - Outcome set to 'Cancelled'`)
      console.log(`   - PCN marked as submitted (pcnSubmitted = true)`)
      console.log(`\n✨ These appointments will no longer appear in the "missing PCNs" list.`)
    }
    
    // Show unmatched appointments
    const matchedGhlIds = allMatches.map(a => a.ghlAppointmentId).filter(Boolean)
    const matchedEmails = allMatches.map(a => a.contact.email?.toLowerCase()).filter(Boolean)
    const matchedPhones = allMatches.map(a => a.contact.phone?.replace(/\D/g, '')).filter(Boolean)
    const matchedNames = allMatches.map(a => a.contact.name.toLowerCase().trim()).filter(Boolean)
    
    const unmatched = cancelledAppointments.filter(c => {
      // Check if already matched by any criteria
      if (matchedGhlIds.includes(c.appointmentId)) return false
      if (c.email && matchedEmails.includes(c.email.toLowerCase())) return false
      if (c.phone) {
        const csvPhone = c.phone.replace(/\D/g, '')
        const isMatched = matchedPhones.some(mp => 
          csvPhone.slice(-10) === mp.slice(-10) || csvPhone === mp
        )
        if (isMatched) return false
      }
      if (c.name) {
        const csvName = c.name.toLowerCase().trim()
        const isMatched = matchedNames.some(mn => 
          calculateSimilarity(csvName, mn) > 0.6
        )
        if (isMatched) return false
      }
      return true
    })
    
    if (unmatched.length > 0) {
      console.log(`\n⚠️  Warning: ${unmatched.length} appointments from CSV were not found in database:`)
      unmatched.slice(0, 10).forEach(apt => {
        console.log(`  - ${apt.name} (${apt.appointmentId}) | Email: ${apt.email || 'N/A'}`)
      })
      if (unmatched.length > 10) {
        console.log(`  ... and ${unmatched.length - 10} more`)
      }
      console.log(`\n   These may not exist in the database yet, or may need different matching criteria.`)
    }
    
  } catch (error) {
    console.error('❌ Error:', error)
    throw error
  } finally {
    await prisma.$disconnect()
  }
}

// Helper function to calculate string similarity (Levenshtein-based)
function calculateSimilarity(str1: string, str2: string): number {
  const longer = str1.length > str2.length ? str1 : str2
  const shorter = str1.length > str2.length ? str2 : str1
  
  if (longer.length === 0) return 1.0
  
  const distance = levenshteinDistance(longer, shorter)
  return (longer.length - distance) / longer.length
}

// Helper function to calculate Levenshtein distance
function levenshteinDistance(str1: string, str2: string): number {
  const matrix: number[][] = []
  
  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i]
  }
  
  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j
  }
  
  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1]
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        )
      }
    }
  }
  
  return matrix[str2.length][str1.length]
}

// Helper function to parse CSV line handling quoted fields
function parseCSVLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    const nextChar = line[i + 1]
    
    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        // Escaped quote
        current += '"'
        i++ // Skip next quote
      } else {
        // Toggle quote state
        inQuotes = !inQuotes
      }
    } else if (char === ',' && !inQuotes) {
      // End of field
      result.push(current)
      current = ''
    } else {
      current += char
    }
  }
  
  // Add last field
  result.push(current)
  
  return result
}

// Run the script
updateCancelledFromCSV()
  .then(() => {
    console.log('\n✨ Script completed successfully')
    process.exit(0)
  })
  .catch((error) => {
    console.error('💥 Script failed:', error)
    process.exit(1)
  })

