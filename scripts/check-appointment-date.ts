/**
 * Check appointment scheduledAt vs createdAt for a specific appointment
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const ghlAppointmentId = 'lu0cBPTMTo6tJr2zbgDA'
  
  console.log(`Checking appointment with GHL ID: ${ghlAppointmentId}\n`)

  const appointment = await prisma.appointment.findFirst({
    where: {
      ghlAppointmentId: ghlAppointmentId
    },
    include: {
      contact: {
        select: {
          name: true
        }
      },
      company: {
        select: {
          name: true,
          timezone: true
        }
      }
    }
  })

  if (!appointment) {
    console.log('❌ Appointment not found')
    await prisma.$disconnect()
    return
  }

  console.log('✅ Appointment found:')
  console.log(`   ID: ${appointment.id}`)
  console.log(`   Contact: ${appointment.contact.name}`)
  console.log(`   Company: ${appointment.company.name}`)
  console.log(`   Company Timezone: ${appointment.company.timezone || 'UTC'}`)
  console.log('')
  console.log('📅 Date Information:')
  console.log(`   createdAt: ${appointment.createdAt.toISOString()}`)
  console.log(`   createdAt (local): ${appointment.createdAt.toLocaleString()}`)
  console.log('')
  console.log(`   scheduledAt: ${appointment.scheduledAt.toISOString()}`)
  console.log(`   scheduledAt (local): ${appointment.scheduledAt.toLocaleString()}`)
  console.log('')
  console.log(`   startTime: ${appointment.startTime?.toISOString() || 'null'}`)
  console.log(`   startTime (local): ${appointment.startTime?.toLocaleString() || 'null'}`)
  console.log('')
  console.log(`   status: ${appointment.status}`)
  console.log(`   pcnSubmitted: ${appointment.pcnSubmitted}`)
  console.log('')
  
  // Calculate time difference
  const timeDiff = appointment.scheduledAt.getTime() - appointment.createdAt.getTime()
  const hoursDiff = timeDiff / (1000 * 60 * 60)
  const daysDiff = timeDiff / (1000 * 60 * 60 * 24)
  
  console.log('⏱️  Time Difference:')
  console.log(`   scheduledAt - createdAt = ${hoursDiff.toFixed(2)} hours (${daysDiff.toFixed(2)} days)`)
  
  if (Math.abs(timeDiff) < 1000) {
    console.log('   ⚠️  WARNING: scheduledAt and createdAt are very close!')
  }

  await prisma.$disconnect()
}

main()
  .catch((e) => {
    console.error('Error:', e)
    process.exit(1)
  })



