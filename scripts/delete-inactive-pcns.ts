import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000)

  const inactiveClosers = await prisma.user.findMany({
    where: {
      isActive: false,
      AppointmentsAsCloser: {
        some: {
          pcnSubmitted: false,
          status: 'scheduled',
          scheduledAt: { lte: tenMinutesAgo }
        }
      }
    },
    select: {
      id: true,
      name: true
    }
  })

  if (inactiveClosers.length === 0) {
    console.log('✅ No inactive/hidden reps currently own pending PCNs.')
    return
  }

  const closerIds = inactiveClosers.map((closer) => closer.id)
  console.log(`Found ${closerIds.length} inactive/hidden reps with pending PCNs:`)
  inactiveClosers.forEach((closer) => {
    console.log(` • ${closer.name || 'Unnamed rep'}`)
  })

  const pendingAppointments = await prisma.appointment.findMany({
    where: {
      closerId: { in: closerIds },
      pcnSubmitted: false,
      status: 'scheduled',
      scheduledAt: { lte: tenMinutesAgo },
      AND: [
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
      closerId: true,
      scheduledAt: true,
      contact: {
        select: {
          name: true
        }
      }
    }
  })

  if (pendingAppointments.length === 0) {
    console.log('✅ No pending PCNs matched the deletion criteria.')
    return
  }

  console.log(`\nDeleting ${pendingAppointments.length} pending PCNs from inactive/hidden reps...\n`)

  await prisma.appointment.deleteMany({
    where: {
      id: {
        in: pendingAppointments.map((apt) => apt.id)
      }
    }
  })

  pendingAppointments.forEach((apt) => {
    const closer = inactiveClosers.find((c) => c.id === apt.closerId)
    console.log(
      ` • Deleted ${apt.contact?.name || 'Unknown contact'} | Closer: ${
        closer?.name || 'Unknown rep'
      } | Scheduled: ${apt.scheduledAt.toISOString()}`
    )
  })

  console.log('\n✅ Done. These appointments no longer appear in Pending PCNs or analytics.')
}

main()
  .catch((error) => {
    console.error('❌ Error deleting inactive PCNs:', error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })

