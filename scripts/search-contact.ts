import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function search() {
  try {
    const searchName = 'Shelby Bush'
    
    // Search for contact
    const contacts = await prisma.contact.findMany({
      where: {
        name: {
          contains: searchName,
          mode: 'insensitive'
        }
      },
      include: {
        company: {
          select: {
            name: true
          }
        }
      }
    })
    
    console.log(`\n📋 Found ${contacts.length} contact(s) matching "Shelby Bush":\n`)
    
    for (const contact of contacts) {
      console.log(`Contact ID: ${contact.id}`)
      console.log(`Name: ${contact.name}`)
      console.log(`Email: ${contact.email || 'N/A'}`)
      console.log(`Phone: ${contact.phone || 'N/A'}`)
      console.log(`Company: ${contact.company?.name || 'N/A'}`)
      console.log(`Created: ${contact.createdAt}`)
      console.log('---')
      
      // Find appointments for this contact
      const appointments = await prisma.appointment.findMany({
        where: {
          contactId: contact.id
        },
        include: {
          closer: {
            select: {
              name: true,
              email: true
            }
          }
        },
        orderBy: {
          scheduledAt: 'desc'
        }
      })
      
      console.log(`\n  📅 Found ${appointments.length} appointment(s) for this contact:\n`)
      
      for (const apt of appointments) {
        console.log(`  Appointment ID: ${apt.id}`)
        console.log(`  GHL Appointment ID: ${apt.ghlAppointmentId || 'N/A'}`)
        console.log(`  Status: ${apt.status}`)
        console.log(`  Scheduled: ${apt.scheduledAt}`)
        console.log(`  Closer: ${apt.closer?.name || 'Unassigned'} (${apt.closer?.email || 'N/A'})`)
        console.log(`  Cash Collected: ${apt.cashCollected ? `$${apt.cashCollected.toLocaleString()}` : 'N/A'}`)
        console.log(`  PCN Submitted: ${apt.pcnSubmitted ? 'Yes' : 'No'}`)
        console.log('  ---')
      }
      console.log('')
    }
    
    // Also search for any appointments with similar names in contact
    const fuzzyContacts = await prisma.contact.findMany({
      where: {
        OR: [
          { name: { contains: 'Shelby', mode: 'insensitive' } },
          { name: { contains: 'Bush', mode: 'insensitive' } }
        ]
      },
      include: {
        company: {
          select: {
            name: true
          }
        }
      }
    })
    
    const exactMatch = fuzzyContacts.find(c => 
      c.name.toLowerCase().includes('shelby') && c.name.toLowerCase().includes('bush')
    )
    
    if (!exactMatch && fuzzyContacts.length > 0) {
      console.log(`\n⚠️  Found ${fuzzyContacts.length} contact(s) with similar names (Shelby or Bush):\n`)
      fuzzyContacts.forEach(c => {
        console.log(`  - ${c.name} (${c.email || 'No email'}) - Company: ${c.company?.name || 'N/A'}`)
      })
    }
    
  } catch (error) {
    console.error('Error:', error)
  } finally {
    await prisma.$disconnect()
  }
}

search()

