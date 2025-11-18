import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function checkMissingPCNs() {
  try {
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000)
    
    // Get all missing PCNs (what the API would return)
    const missingPCNs = await prisma.appointment.findMany({
      where: {
        pcnSubmitted: false,
        scheduledAt: {
          lte: tenMinutesAgo
        },
        status: {
          not: 'cancelled'
        },
        AND: [
          {
            OR: [
              { outcome: { notIn: ['Cancelled', 'cancelled'] } },
              { outcome: null }
            ]
          },
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
        status: true,
        outcome: true,
        appointmentInclusionFlag: true,
        scheduledAt: true,
        contact: {
          select: {
            name: true
          }
        }
      },
      take: 20
    })
    
    console.log(`📊 Total missing PCNs: ${missingPCNs.length} shown (first 20)`)
    console.log('\n📋 Sample appointments in missing PCNs:')
    missingPCNs.forEach(apt => {
      console.log(`  - ${apt.contact.name} | Status: ${apt.status} | Outcome: ${apt.outcome || 'null'} | Flag: ${apt.appointmentInclusionFlag ?? 'null'} | Date: ${apt.scheduledAt.toISOString().split('T')[0]}`)
    })
    
    // Check how many have status = 'cancelled' but still show up (shouldn't happen)
    const cancelledButMissing = await prisma.appointment.count({
      where: {
        pcnSubmitted: false,
        status: 'cancelled'
      }
    })
    
    console.log(`\n🔍 Appointments with status='cancelled' and pcnSubmitted=false: ${cancelledButMissing}`)
    
    // Check how many have outcome = 'Cancelled' but status != 'cancelled'
    const cancelledByOutcome = await prisma.appointment.findMany({
      where: {
        pcnSubmitted: false,
        scheduledAt: {
          lte: tenMinutesAgo
        },
        status: {
          not: 'cancelled'
        },
        OR: [
          { outcome: 'Cancelled' },
          { outcome: 'cancelled' }
        ]
      },
      select: {
        id: true,
        status: true,
        outcome: true
      },
      take: 10
    })
    
    console.log(`\n🔍 Appointments with outcome='Cancelled' but status!='cancelled': ${cancelledByOutcome.length} shown (first 10)`)
    cancelledByOutcome.forEach(apt => {
      console.log(`  - Status: ${apt.status} | Outcome: ${apt.outcome}`)
    })
    
  } catch (error) {
    console.error('❌ Error:', error)
    throw error
  } finally {
    await prisma.$disconnect()
  }
}

checkMissingPCNs()



