import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function clearAppointmentsAndContacts() {
  try {
    console.log('Starting deletion of appointments and contacts...')
    
    // First, delete all appointments (they reference contacts)
    const deletedAppointments = await prisma.appointment.deleteMany({})
    console.log(`✅ Deleted ${deletedAppointments.count} appointments`)
    
    // Then, delete all contacts
    const deletedContacts = await prisma.contact.deleteMany({})
    console.log(`✅ Deleted ${deletedContacts.count} contacts`)
    
    console.log('\n✅ Successfully cleared all appointments and contacts!')
    console.log(`   - Appointments deleted: ${deletedAppointments.count}`)
    console.log(`   - Contacts deleted: ${deletedContacts.count}`)
    
  } catch (error) {
    console.error('❌ Error clearing data:', error)
    throw error
  } finally {
    await prisma.$disconnect()
  }
}

clearAppointmentsAndContacts()

