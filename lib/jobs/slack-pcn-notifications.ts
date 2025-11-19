import { withPrisma } from '../db'
import { notifyPendingPCN } from '../slack-pcn-notifier'

/**
 * Background job to check for pending PCNs and send Slack notifications
 * Should be called periodically (every 5-10 minutes)
 */
export async function checkAndNotifyPendingPCNs(): Promise<{
  checked: number
  notified: number
  errors: number
}> {
  const stats = {
    checked: 0,
    notified: 0,
    errors: 0,
  }

  try {
    const now = new Date()
    const tenMinutesAgo = new Date(now.getTime() - 10 * 60 * 1000)

    // Find all appointments that:
    // 1. Are pending PCN (pcnSubmitted = false, status = 'scheduled')
    // 2. Were scheduled more than 10 minutes ago
    // 3. Have a closer assigned
    // 4. Company has Slack connected
    // 5. Don't already have a Slack message sent
    const pendingAppointments = await withPrisma(async (prisma) => {
      // Get all companies with Slack connected
      const companiesWithSlack = await prisma.company.findMany({
        where: {
          slackConnectedAt: { not: null },
          slackBotToken: { not: null },
        },
        select: { id: true },
      })

      const companyIds = companiesWithSlack.map((c) => c.id)

      if (companyIds.length === 0) {
        return []
      }

      // Get appointments that need notifications
      const appointments = await prisma.appointment.findMany({
        where: {
          companyId: { in: companyIds },
          pcnSubmitted: false,
          status: 'scheduled',
          scheduledAt: { lte: tenMinutesAgo },
          closerId: { not: null },
          // Only include appointments with inclusion flag = 1 or null
          OR: [{ appointmentInclusionFlag: 1 }, { appointmentInclusionFlag: null }],
        },
        include: {
          closer: {
            select: {
              slackUserId: true,
            },
          },
        },
      })

      // Filter to only appointments where closer has Slack ID
      const appointmentsWithSlackMapped = appointments.filter(
        (apt) => apt.closer?.slackUserId
      )

      // Get appointment IDs that already have Slack messages
      const existingMessages = await prisma.slackMessage.findMany({
        where: {
          appointmentId: { in: appointmentsWithSlackMapped.map((a) => a.id) },
        },
        select: { appointmentId: true },
      })

      const existingAppointmentIds = new Set(existingMessages.map((m) => m.appointmentId))

      // Return only appointments that don't have messages yet
      return appointmentsWithSlackMapped.filter(
        (apt) => !existingAppointmentIds.has(apt.id)
      )
    })

    stats.checked = pendingAppointments.length

    // Send notifications for each appointment
    for (const appointment of pendingAppointments) {
      try {
        const success = await notifyPendingPCN(appointment.id)
        if (success) {
          stats.notified++
        } else {
          stats.errors++
        }
      } catch (error) {
        console.error(`[Slack PCN Job] Error processing appointment ${appointment.id}:`, error)
        stats.errors++
      }
    }

    return stats
  } catch (error: any) {
    console.error('[Slack PCN Job] Error:', error)
    throw error
  }
}

