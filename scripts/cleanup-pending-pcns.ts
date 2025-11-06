import { PrismaClient } from '@prisma/client'
import { withPrisma } from '../lib/db'

async function cleanupPendingPCNs() {
  try {
    console.log('🔍 Finding appointments that should not be in pending PCNs...\n')
    
    await withPrisma(async (prisma) => {
      // Find all appointments that:
      // 1. Have pcnSubmitted = false (currently marked as pending PCN)
      // 2. But are NOT in "scheduled" status
      // These should be marked as PCN completed
      
      const appointmentsToUpdate = await prisma.appointment.findMany({
        where: {
          pcnSubmitted: false,
          status: {
            not: 'scheduled'
          }
        },
        select: {
          id: true,
          status: true,
          outcome: true,
          pcnSubmitted: true,
          scheduledAt: true,
          contact: {
            select: {
              name: true
            }
          }
        }
      })
      
      console.log(`📊 Found ${appointmentsToUpdate.length} appointments that need to be marked as PCN completed`)
      
      if (appointmentsToUpdate.length === 0) {
        console.log('✅ No appointments need updating. All pending PCNs are correctly filtered.')
        return
      }
      
      // Group by status for reporting
      const byStatus = appointmentsToUpdate.reduce((acc: any, apt) => {
        const status = apt.status || 'unknown'
        if (!acc[status]) {
          acc[status] = []
        }
        acc[status].push(apt)
        return acc
      }, {})
      
      console.log('\n📋 Breakdown by status:')
      Object.entries(byStatus).forEach(([status, apps]: [string, any]) => {
        console.log(`   - ${status}: ${apps.length} appointments`)
      })
      
      // Show sample
      console.log('\n📋 Sample appointments to update:')
      appointmentsToUpdate.slice(0, 10).forEach(apt => {
        console.log(`   - ${apt.contact.name} (${apt.id}) | Status: ${apt.status} | Outcome: ${apt.outcome || 'N/A'}`)
      })
      
      if (appointmentsToUpdate.length > 10) {
        console.log(`   ... and ${appointmentsToUpdate.length - 10} more`)
      }
      
      // Update all appointments to mark PCN as submitted
      const updateResult = await prisma.appointment.updateMany({
        where: {
          id: {
            in: appointmentsToUpdate.map(a => a.id)
          }
        },
        data: {
          pcnSubmitted: true,
          // Don't set pcnSubmittedAt since these weren't actually submitted
          // They're just marked as complete because they don't need PCNs
        }
      })
      
      console.log(`\n✅ Successfully updated ${updateResult.count} appointments`)
      console.log('   - pcnSubmitted set to true')
      console.log('   - These appointments will no longer appear in pending PCNs')
      console.log('\n✨ Cleanup complete!')
    })
    
  } catch (error: any) {
    console.error('❌ Cleanup failed:', error.message)
    throw error
  }
}

cleanupPendingPCNs()

