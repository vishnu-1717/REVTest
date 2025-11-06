import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function cleanupCancelledMissingPCNs() {
  try {
    console.log('🔍 Finding cancelled appointments that are incorrectly flagged as missing PCNs...')
    
    // Find all appointments that are cancelled (by status OR outcome) and pcnSubmitted = false
    // These should be marked as PCN submitted since cancelled appointments don't need PCNs
    console.log('🔍 Finding all cancelled appointments that are flagged as missing PCNs...')
    
    const cancelledAppointments = await prisma.appointment.findMany({
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
        companyId: true,
        contactId: true,
        scheduledAt: true,
        status: true,
        outcome: true,
        appointmentInclusionFlag: true,
        contact: {
          select: {
            name: true
          }
        }
      }
    })
    
    console.log(`📊 Found ${cancelledAppointments.length} cancelled appointments with missing PCNs`)
    
    if (cancelledAppointments.length === 0) {
      console.log('✅ No cancelled appointments to clean up!')
      return
    }
    
    // Group by company for reporting
    const byCompany: Record<string, number> = {}
    cancelledAppointments.forEach(apt => {
      byCompany[apt.companyId] = (byCompany[apt.companyId] || 0) + 1
    })
    
    console.log('\n📈 Breakdown by company:')
    Object.entries(byCompany).forEach(([companyId, count]) => {
      console.log(`  Company ${companyId}: ${count} appointments`)
    })
    
    // Show sample of what will be cleaned
    console.log('\n📋 Sample of appointments to clean up:')
    cancelledAppointments.slice(0, 10).forEach(apt => {
      console.log(`  - ${apt.contact.name} (${apt.scheduledAt.toISOString().split('T')[0]}) | Status: ${apt.status} | Outcome: ${apt.outcome || 'null'}`)
    })
    
    if (cancelledAppointments.length > 10) {
      console.log(`  ... and ${cancelledAppointments.length - 10} more`)
    }
    
    // Actually perform the cleanup - mark as PCN submitted since cancelled appointments don't need PCNs
    console.log('\n🔄 Marking cancelled appointments as PCN submitted...')
    console.log('   This will remove them from the "missing PCNs" list.')
    
    const result = await prisma.appointment.updateMany({
      where: {
        pcnSubmitted: false,
        OR: [
          { status: 'cancelled' },
          { outcome: 'Cancelled' },
          { outcome: 'cancelled' }
        ]
      },
      data: {
        pcnSubmitted: true,
        pcnSubmittedAt: new Date()
      }
    })
    
    console.log(`✅ Successfully updated ${result.count} appointments`)
    console.log(`   These appointments will no longer appear in the "missing PCNs" list.`)
    
    // Alternative: Delete the appointments (uncomment if preferred)
    /*
    console.log('\n🗑️  Deleting cancelled appointments...')
    
    const result = await prisma.appointment.deleteMany({
      where: {
        id: {
          in: cancelledAppointments.map(a => a.id)
        }
      }
    })
    
    console.log(`✅ Successfully deleted ${result.count} appointments`)
    */
    
  } catch (error) {
    console.error('❌ Error cleaning up cancelled appointments:', error)
    throw error
  } finally {
    await prisma.$disconnect()
  }
}

// Run the cleanup
cleanupCancelledMissingPCNs()
  .then(() => {
    console.log('\n✨ Cleanup script completed')
    process.exit(0)
  })
  .catch((error) => {
    console.error('💥 Cleanup script failed:', error)
    process.exit(1)
  })

