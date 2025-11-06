import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function checkCancelledAppointments() {
  try {
    // Count all appointments with status = 'cancelled'
    const cancelledCount = await prisma.appointment.count({
      where: {
        status: 'cancelled'
      }
    })
    
    console.log(`📊 Total appointments with status = 'cancelled': ${cancelledCount}`)
    
    // Count cancelled appointments with pcnSubmitted = false
    const cancelledMissingPCN = await prisma.appointment.count({
      where: {
        status: 'cancelled',
        pcnSubmitted: false
      }
    })
    
    console.log(`📊 Cancelled appointments with pcnSubmitted = false: ${cancelledMissingPCN}`)
    
    // Count cancelled appointments with pcnSubmitted = true
    const cancelledWithPCN = await prisma.appointment.count({
      where: {
        status: 'cancelled',
        pcnSubmitted: true
      }
    })
    
    console.log(`📊 Cancelled appointments with pcnSubmitted = true: ${cancelledWithPCN}`)
    
    // Get a sample of cancelled appointments
    const sampleCancelled = await prisma.appointment.findMany({
      where: {
        status: 'cancelled'
      },
      select: {
        id: true,
        scheduledAt: true,
        pcnSubmitted: true,
        outcome: true,
        contact: {
          select: {
            name: true
          }
        }
      },
      take: 10
    })
    
    console.log('\n📋 Sample cancelled appointments:')
    sampleCancelled.forEach(apt => {
      console.log(`  - ${apt.contact.name} | PCN Submitted: ${apt.pcnSubmitted} | Outcome: ${apt.outcome || 'null'} | Date: ${apt.scheduledAt.toISOString().split('T')[0]}`)
    })
    
  } catch (error) {
    console.error('❌ Error:', error)
    throw error
  } finally {
    await prisma.$disconnect()
  }
}

checkCancelledAppointments()

