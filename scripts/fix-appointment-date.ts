/**
 * Fix appointment scheduledAt date
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const ghlAppointmentId = 'lu0cBPTMTo6tJr2zbgDA'
  
  console.log(`Fixing appointment with GHL ID: ${ghlAppointmentId}\n`)

  // The correct scheduled date: Nov 14, 2025, 1:00 PM Eastern
  // America/New_York timezone
  // Nov 14, 2025, 1:00 PM EST = 2025-11-14T18:00:00.000Z (UTC)
  const correctScheduledAt = new Date('2025-11-14T18:00:00.000Z')
  
  console.log('Correct scheduledAt:', correctScheduledAt.toISOString())
  console.log('Correct scheduledAt (Eastern):', correctScheduledAt.toLocaleString('en-US', { timeZone: 'America/New_York' }))
  console.log('')

  const appointment = await prisma.appointment.findFirst({
    where: {
      ghlAppointmentId: ghlAppointmentId
    }
  })

  if (!appointment) {
    console.log('❌ Appointment not found')
    await prisma.$disconnect()
    return
  }

  console.log('Current scheduledAt:', appointment.scheduledAt.toISOString())
  console.log('Current scheduledAt (Eastern):', appointment.scheduledAt.toLocaleString('en-US', { timeZone: 'America/New_York' }))
  console.log('')

  // Update the appointment
  const updated = await prisma.appointment.update({
    where: { id: appointment.id },
    data: {
      scheduledAt: correctScheduledAt,
      startTime: correctScheduledAt
    }
  })

  console.log('✅ Appointment updated!')
  console.log('New scheduledAt:', updated.scheduledAt.toISOString())
  console.log('New scheduledAt (Eastern):', updated.scheduledAt.toLocaleString('en-US', { timeZone: 'America/New_York' }))
  console.log('')

  await prisma.$disconnect()
}

main()
  .catch((e) => {
    console.error('Error:', e)
    process.exit(1)
  })



