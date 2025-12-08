import { PrismaClient } from '@prisma/client'
import * as dotenv from 'dotenv'
import * as path from 'path'

// Load .env.local file (Next.js convention)
dotenv.config({ path: path.join(process.cwd(), '.env.local') })
// Also try .env as fallback
dotenv.config({ path: path.join(process.cwd(), '.env') })

const prisma = new PrismaClient()

interface AnalysisResult {
  appointmentId: string
  contactId: string
  contactName: string
  contactEmail: string | null
  contactPhone: string | null
  ghlContactId: string | null
  appointmentStatus: string
  pcnSubmitted: boolean
  pcnSubmittedAt: Date | null
  scheduledAt: Date
  ghlAppointmentId: string | null
  closerName: string | null
  calendarName: string | null
  contactCreatedAt: Date
  contactUpdatedAt: Date
  hasEmail: boolean
  hasPhone: boolean
  hasGhlContactId: boolean
  customFields: any
  likelyCause: string[]
}

async function analyzeUnknownPCNContacts() {
  console.log('🔍 Analyzing PCNs with "Unknown" contacts...\n')

  // First, let's check all "Unknown" contacts
  const allUnknownContacts = await prisma.contact.findMany({
    where: {
      name: 'Unknown'
    },
    include: {
      Appointment: {
        include: {
          closer: { select: { name: true } },
          calendarRelation: { select: { name: true } }
        },
        orderBy: {
          scheduledAt: 'desc'
        }
      }
    }
  })

  console.log(`📊 Found ${allUnknownContacts.length} total "Unknown" contacts\n`)

  // Find all appointments with PCNs submitted that have "Unknown" contacts
  const appointments = await prisma.appointment.findMany({
    where: {
      contact: {
        name: 'Unknown'
      },
      OR: [
        { pcnSubmitted: true },
        { pcnSubmittedAt: { not: null } },
        // Also include appointments that should have PCNs (past appointments that aren't cancelled)
        {
          scheduledAt: { lte: new Date() },
          status: { not: 'cancelled' }
        }
      ]
    },
    include: {
      contact: true,
      closer: {
        select: {
          name: true
        }
      },
      calendarRelation: {
        select: {
          name: true
        }
      }
    },
    orderBy: {
      scheduledAt: 'desc'
    }
  })

  console.log(`📊 Found ${appointments.length} appointments with "Unknown" contacts (including PCNs and past appointments)\n`)

  // Show summary of all unknown contacts
  if (allUnknownContacts.length > 0) {
    console.log('📋 ALL "UNKNOWN" CONTACTS SUMMARY\n')
    console.log('=' .repeat(80))
    
    const withAppointments = allUnknownContacts.filter(c => c.Appointment.length > 0)
    const withPCNs = allUnknownContacts.filter(c => 
      c.Appointment.some(a => a.pcnSubmitted || a.pcnSubmittedAt)
    )
    const withGhlId = allUnknownContacts.filter(c => c.ghlContactId)
    const withEmail = allUnknownContacts.filter(c => c.email)
    const withPhone = allUnknownContacts.filter(c => c.phone)
    
    console.log(`Total "Unknown" contacts: ${allUnknownContacts.length}`)
    console.log(`  - With appointments: ${withAppointments.length}`)
    console.log(`  - With PCNs submitted: ${withPCNs.length}`)
    console.log(`  - With GHL Contact ID: ${withGhlId.length}`)
    console.log(`  - With email: ${withEmail.length}`)
    console.log(`  - With phone: ${withPhone.length}`)
    console.log(`  - With no contact info: ${allUnknownContacts.filter(c => !c.email && !c.phone && !c.ghlContactId).length}`)
    console.log('')
  }

  if (appointments.length === 0) {
    console.log('✅ No appointments with "Unknown" contacts found that need PCNs!')
    if (allUnknownContacts.length > 0) {
      console.log(`\n⚠️  However, there are ${allUnknownContacts.length} "Unknown" contacts in the system.`)
      console.log('   These may be associated with future appointments or other records.')
    }
    await prisma.$disconnect()
    return
  }

  const analysis: AnalysisResult[] = []

  for (const apt of appointments) {
    const contact = apt.contact
    const likelyCauses: string[] = []

    // Analyze why contact is "Unknown"
    
    // 1. Check if contact has no identifying information
    if (!contact.email && !contact.phone && !contact.ghlContactId) {
      likelyCauses.push('No email, phone, or GHL contact ID')
    }

    // 2. Check if contact was created from webhook without name data
    if (contact.ghlContactId) {
      // Contact exists in GHL but name is Unknown - webhook likely didn't have name
      likelyCauses.push('GHL contact exists but webhook missing contactName/firstName/lastName')
    } else {
      // No GHL contact ID - might be from payment or import
      likelyCauses.push('No GHL contact ID (possibly created from payment/import)')
    }

    // 3. Check if contact was never updated after creation
    const daysSinceCreation = (Date.now() - contact.createdAt.getTime()) / (1000 * 60 * 60 * 24)
    const daysSinceUpdate = (Date.now() - contact.updatedAt.getTime()) / (1000 * 60 * 60 * 24)
    
    if (daysSinceUpdate > 7 && contact.name === 'Unknown') {
      likelyCauses.push(`Contact never updated (${Math.round(daysSinceUpdate)} days old)`)
    }

    // 4. Check if appointment has customFields that might contain contact info
    const customFields = apt.customFields as any
    if (customFields) {
      const hasContactInfoInFields = 
        customFields.contactName || 
        customFields.firstName || 
        customFields.lastName ||
        customFields.contactEmail ||
        customFields.contactPhone
      
      if (hasContactInfoInFields) {
        likelyCauses.push('Contact info exists in appointment customFields but not synced to contact')
      }
    }

    // 5. Check if contact has email/phone but name is still Unknown
    if ((contact.email || contact.phone) && contact.name === 'Unknown') {
      likelyCauses.push('Has email/phone but name never populated')
    }

    analysis.push({
      appointmentId: apt.id,
      contactId: contact.id,
      contactName: contact.name,
      contactEmail: contact.email,
      contactPhone: contact.phone,
      ghlContactId: contact.ghlContactId,
      appointmentStatus: apt.status,
      pcnSubmitted: apt.pcnSubmitted,
      pcnSubmittedAt: apt.pcnSubmittedAt,
      scheduledAt: apt.scheduledAt,
      ghlAppointmentId: apt.ghlAppointmentId,
      closerName: apt.closer?.name || null,
      calendarName: apt.calendarRelation?.name || null,
      contactCreatedAt: contact.createdAt,
      contactUpdatedAt: contact.updatedAt,
      hasEmail: !!contact.email,
      hasPhone: !!contact.phone,
      hasGhlContactId: !!contact.ghlContactId,
      customFields: customFields,
      likelyCause: likelyCauses
    })
  }

  // Generate summary statistics
  console.log('📈 SUMMARY STATISTICS\n')
  console.log('=' .repeat(80))
  
  const withGhlContactId = analysis.filter(a => a.hasGhlContactId).length
  const withoutGhlContactId = analysis.filter(a => !a.hasGhlContactId).length
  const withEmail = analysis.filter(a => a.hasEmail).length
  const withPhone = analysis.filter(a => a.hasPhone).length
  const withNoContactInfo = analysis.filter(a => !a.hasEmail && !a.hasPhone && !a.hasGhlContactId).length
  
  console.log(`Total PCNs with "Unknown" contacts: ${analysis.length}`)
  console.log(`  - With GHL Contact ID: ${withGhlContactId} (${Math.round(withGhlContactId / analysis.length * 100)}%)`)
  console.log(`  - Without GHL Contact ID: ${withoutGhlContactId} (${Math.round(withoutGhlContactId / analysis.length * 100)}%)`)
  console.log(`  - With Email: ${withEmail} (${Math.round(withEmail / analysis.length * 100)}%)`)
  console.log(`  - With Phone: ${withPhone} (${Math.round(withPhone / analysis.length * 100)}%)`)
  console.log(`  - No contact info at all: ${withNoContactInfo} (${Math.round(withNoContactInfo / analysis.length * 100)}%)`)

  // Group by likely cause
  console.log('\n🔍 ROOT CAUSE ANALYSIS\n')
  console.log('=' .repeat(80))
  
  const causeCounts = new Map<string, number>()
  analysis.forEach(a => {
    a.likelyCause.forEach(cause => {
      causeCounts.set(cause, (causeCounts.get(cause) || 0) + 1)
    })
  })

  const sortedCauses = Array.from(causeCounts.entries())
    .sort((a, b) => b[1] - a[1])

  console.log('\nMost common causes:')
  sortedCauses.forEach(([cause, count]) => {
    const percentage = Math.round((count / analysis.length) * 100)
    console.log(`  ${cause}: ${count} (${percentage}%)`)
  })

  // Show recent examples
  console.log('\n📋 RECENT EXAMPLES (Last 20)\n')
  console.log('=' .repeat(80))
  
  const recent = analysis.slice(0, 20)
  recent.forEach((a, idx) => {
    console.log(`\n${idx + 1}. Appointment ${a.appointmentId.substring(0, 8)}...`)
    console.log(`   Scheduled: ${a.scheduledAt.toISOString().split('T')[0]}`)
    console.log(`   Status: ${a.appointmentStatus}`)
    console.log(`   PCN Submitted: ${a.pcnSubmitted ? 'Yes' : 'No'} ${a.pcnSubmittedAt ? `(${a.pcnSubmittedAt.toISOString().split('T')[0]})` : ''}`)
    console.log(`   Closer: ${a.closerName || 'Unassigned'}`)
    console.log(`   Calendar: ${a.calendarName || 'Unknown'}`)
    console.log(`   GHL Appointment ID: ${a.ghlAppointmentId || 'None'}`)
    console.log(`   Contact Info:`)
    console.log(`     - Email: ${a.contactEmail || 'None'}`)
    console.log(`     - Phone: ${a.contactPhone || 'None'}`)
    console.log(`     - GHL Contact ID: ${a.ghlContactId || 'None'}`)
    console.log(`     - Created: ${a.contactCreatedAt.toISOString().split('T')[0]}`)
    console.log(`     - Updated: ${a.contactUpdatedAt.toISOString().split('T')[0]}`)
    console.log(`   Likely Causes:`)
    a.likelyCause.forEach(cause => {
      console.log(`     - ${cause}`)
    })
    if (a.customFields && Object.keys(a.customFields).length > 0) {
      console.log(`   Custom Fields (may contain contact info):`)
      Object.entries(a.customFields).slice(0, 5).forEach(([key, value]) => {
        if (typeof value === 'string' && value.length < 100) {
          console.log(`     - ${key}: ${value}`)
        }
      })
    }
  })

  // Recommendations
  console.log('\n\n💡 RECOMMENDATIONS\n')
  console.log('=' .repeat(80))
  
  if (withGhlContactId > 0) {
    console.log(`\n1. ${withGhlContactId} contacts have GHL Contact IDs but are still "Unknown"`)
    console.log('   → These likely came from webhooks missing contactName/firstName/lastName')
    console.log('   → Solution: Fetch contact names from GHL API using ghlContactId')
  }
  
  if (withEmail > 0 || withPhone > 0) {
    console.log(`\n2. ${withEmail + withPhone} contacts have email/phone but no name`)
    console.log('   → These could be updated by fetching from GHL or other sources')
  }
  
  if (withNoContactInfo > 0) {
    console.log(`\n3. ${withNoContactInfo} contacts have no identifying information at all`)
    console.log('   → These may need manual review or deletion')
  }

  console.log('\n\n✅ Analysis complete!')
  await prisma.$disconnect()
}

analyzeUnknownPCNContacts()
  .then(() => {
    process.exit(0)
  })
  .catch((error) => {
    console.error('Error:', error)
    process.exit(1)
  })

