/**
 * List contact/prospect names for failed PCN webhook events
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const failedEventIds = [
    'cmhxuvjv50009ic04d3w6mj61',
    'cmhwosf2j0007l204m8vqb0hd',
    'cmhwo2nxj0001l204lww225ic',
    'cmhwnja930001l704ra8ct5no',
    'cmhwn6cbg004jjs043c2p0p46',
    'cmhwmzvov004bjs04ebvoi963'
  ]

  console.log('Fetching failed PCN webhook events...\n')

  const failedEvents = await prisma.webhookEvent.findMany({
    where: {
      id: { in: failedEventIds }
    },
    orderBy: {
      createdAt: 'desc'
    },
    include: {
      Company: {
        select: {
          id: true,
          name: true
        }
      }
    }
  })

  console.log(`Found ${failedEvents.length} failed events\n`)
  console.log('='.repeat(80))
  console.log('\nContact/Prospect Information:\n')

  failedEvents.forEach((event, index) => {
    const errorPayload = event.payload as any
    const rawPayload = errorPayload?.raw || errorPayload
    const appointmentId = errorPayload?.appointmentId || errorPayload?.details?.appointmentId

    // Try to extract contact name from various possible fields
    const contactName = 
      rawPayload?.['full_name'] ||
      rawPayload?.['Full Name'] ||
      rawPayload?.['fullName'] ||
      rawPayload?.['contact']?.name ||
      rawPayload?.['contact']?.fullName ||
      rawPayload?.['user']?.firstName && rawPayload?.['user']?.lastName 
        ? `${rawPayload['user'].firstName} ${rawPayload['user'].lastName}`.trim()
        : rawPayload?.['first_name'] && rawPayload?.['last_name']
        ? `${rawPayload['first_name']} ${rawPayload['last_name']}`.trim()
        : rawPayload?.['First Name'] && rawPayload?.['Last Name']
        ? `${rawPayload['First Name']} ${rawPayload['Last Name']}`.trim()
        : rawPayload?.['firstName'] && rawPayload?.['lastName']
        ? `${rawPayload['firstName']} ${rawPayload['lastName']}`.trim()
        : rawPayload?.['name'] ||
      'Unknown'

    const email = 
      rawPayload?.['email'] ||
      rawPayload?.['Email'] ||
      rawPayload?.['contact']?.email ||
      rawPayload?.['user']?.email ||
      'N/A'

    const phone = 
      rawPayload?.['phone'] ||
      rawPayload?.['Phone'] ||
      rawPayload?.['contact']?.phone ||
      rawPayload?.['user']?.phone ||
      'N/A'

    console.log(`${index + 1}. Event ID: ${event.id}`)
    console.log(`   Created: ${event.createdAt}`)
    console.log(`   Company: ${event.Company?.name || 'Unknown'}`)
    console.log(`   Appointment ID: ${appointmentId || 'N/A'}`)
    console.log(`   Contact Name: ${contactName}`)
    console.log(`   Email: ${email}`)
    console.log(`   Phone: ${phone}`)
    console.log(`   Error: ${(errorPayload as any)?.message || (errorPayload as any)?.details || 'Unknown'}`)
    console.log('')
  })

  await prisma.$disconnect()
}

main()
  .catch((e) => {
    console.error('Error:', e)
    process.exit(1)
  })



