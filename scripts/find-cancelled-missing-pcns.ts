import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function findCancelledMissingPCNs() {
  try {
    console.log('🔍 Finding cancelled appointments with pcnSubmitted = false...\n')
    
    // Find all cancelled appointments with pcnSubmitted = false
    const cancelledMissingPCN = await prisma.appointment.findMany({
      where: {
        pcnSubmitted: false,
        OR: [
          { status: 'cancelled' },
          { outcome: 'Cancelled' },
          { outcome: 'cancelled' }
        ]
      },
      select: {
        id: true,
        ghlAppointmentId: true,
        scheduledAt: true,
        createdAt: true,
        updatedAt: true,
        status: true,
        outcome: true,
        pcnSubmitted: true,
        pcnSubmittedAt: true,
        contact: {
          select: {
            id: true,
            name: true,
            email: true,
            ghlContactId: true
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
      },
      take: 50 // Show first 50
    })
    
    console.log(`📊 Found ${cancelledMissingPCN.length} cancelled appointments with pcnSubmitted = false\n`)
    
    if (cancelledMissingPCN.length === 0) {
      console.log('✅ No cancelled appointments with missing PCNs found!')
      return
    }
    
    // Group by company
    const byCompany: Record<string, number> = {}
    cancelledMissingPCN.forEach(apt => {
      const companyName = apt.company.name
      byCompany[companyName] = (byCompany[companyName] || 0) + 1
    })
    
    console.log('📈 Breakdown by company:')
    Object.entries(byCompany).forEach(([companyName, count]) => {
      console.log(`  ${companyName}: ${count} appointments`)
    })
    
    console.log('\n📋 Detailed list of cancelled appointments with missing PCNs:')
    console.log('─'.repeat(120))
    cancelledMissingPCN.forEach((apt, index) => {
      console.log(`\n${index + 1}. ${apt.contact.name} (${apt.contact.email || 'no email'})`)
      console.log(`   Appointment ID: ${apt.id}`)
      console.log(`   GHL Appointment ID: ${apt.ghlAppointmentId || 'N/A'}`)
      console.log(`   Company: ${apt.company.name}`)
      console.log(`   Scheduled: ${apt.scheduledAt.toISOString()}`)
      console.log(`   Created: ${apt.createdAt.toISOString()}`)
      console.log(`   Updated: ${apt.updatedAt.toISOString()}`)
      console.log(`   Status: ${apt.status}`)
      console.log(`   Outcome: ${apt.outcome || 'null'}`)
      console.log(`   PCN Submitted: ${apt.pcnSubmitted}`)
      console.log(`   PCN Submitted At: ${apt.pcnSubmittedAt?.toISOString() || 'null'}`)
    })
    
    // Check if these have GHL appointment IDs (indicating they came from webhooks)
    const withGhlId = cancelledMissingPCN.filter(apt => apt.ghlAppointmentId)
    const withoutGhlId = cancelledMissingPCN.filter(apt => !apt.ghlAppointmentId)
    
    console.log(`\n📊 Analysis:`)
    console.log(`   - ${withGhlId.length} have GHL Appointment IDs (likely from webhooks)`)
    console.log(`   - ${withoutGhlId.length} don't have GHL Appointment IDs (likely imported or created manually)`)
    
    // Check if updatedAt is after createdAt (indicating they were updated by webhook)
    const updatedAfterCreated = cancelledMissingPCN.filter(apt => {
      const updatedTime = apt.updatedAt.getTime()
      const createdTime = apt.createdAt.getTime()
      // Allow 5 second buffer for processing time
      return updatedTime > createdTime + 5000
    })
    
    console.log(`   - ${updatedAfterCreated.length} were updated after creation (likely webhook processed them)`)
    
    // Check webhook events for these appointments
    if (withGhlId.length > 0) {
      console.log(`\n🔍 Checking webhook events for appointments with GHL IDs...`)
      const ghlIds = withGhlId.map(apt => apt.ghlAppointmentId).filter(Boolean) as string[]
      
      const webhookEvents = await prisma.webhookEvent.findMany({
        where: {
          companyId: { in: cancelledMissingPCN.map(apt => apt.company.id) },
          OR: [
            { eventType: { contains: 'cancel', mode: 'insensitive' } },
            { payload: { path: ['appointmentStatus'], equals: 'cancelled' } }
          ]
        },
        select: {
          id: true,
          eventType: true,
          processed: true,
          processedAt: true,
          createdAt: true,
          payload: true
        },
        take: 20
      })
      
      console.log(`   Found ${webhookEvents.length} cancellation-related webhook events`)
      if (webhookEvents.length > 0) {
        console.log(`   Sample webhook events:`)
        webhookEvents.slice(0, 5).forEach(event => {
          const payload = event.payload as any
          console.log(`     - Event: ${event.eventType} | Processed: ${event.processed} | Created: ${event.createdAt.toISOString()}`)
          console.log(`       Appointment ID in payload: ${payload?.appointmentId || payload?.id || 'N/A'}`)
        })
      }
    }
    
  } catch (error) {
    console.error('❌ Error:', error)
    throw error
  } finally {
    await prisma.$disconnect()
  }
}

findCancelledMissingPCNs()

