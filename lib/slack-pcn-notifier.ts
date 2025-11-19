import { withPrisma } from './db'
import { sendPCNNotification, postThreadMessage } from './slack-client'

/**
 * Notify about a pending PCN via Slack
 */
export async function notifyPendingPCN(appointmentId: string): Promise<boolean> {
  try {
    const appointment = await withPrisma(async (prisma) => {
      return await prisma.appointment.findUnique({
        where: { id: appointmentId },
        include: {
          contact: {
            select: {
              name: true,
              email: true,
            },
          },
          closer: {
            select: {
              id: true,
              name: true,
              slackUserId: true,
            },
          },
          company: {
            select: {
              id: true,
              slackConnectedAt: true,
              slackChannelId: true,
            },
          },
        },
      })
    })

    if (!appointment) {
      console.warn(`[Slack PCN] Appointment ${appointmentId} not found`)
      return false
    }

    // Check if company has Slack connected
    if (!appointment.company.slackConnectedAt) {
      console.log(`[Slack PCN] Company ${appointment.companyId} does not have Slack connected`)
      return false
    }

    // Check if closer has Slack user ID mapped
    if (!appointment.closer?.slackUserId) {
      console.warn(
        `[Slack PCN] Closer ${appointment.closerId} does not have Slack user ID mapped for appointment ${appointmentId}`
      )
      return false
    }

    // Send notification
    const result = await sendPCNNotification(
      appointment.companyId,
      {
        id: appointment.id,
        contact: {
          name: appointment.contact.name,
          email: appointment.contact.email,
        },
        closer: {
          id: appointment.closer.id,
          name: appointment.closer.name,
          slackUserId: appointment.closer.slackUserId,
        },
        scheduledAt: appointment.scheduledAt,
      },
      appointment.company.slackChannelId || undefined
    )

    if (!result) {
      return false
    }

    // Store message in database for thread tracking
    await withPrisma(async (prisma) => {
      await prisma.slackMessage.upsert({
        where: { appointmentId: appointment.id },
        create: {
          appointmentId: appointment.id,
          companyId: appointment.companyId,
          slackChannelId: result.channelId,
          slackMessageTs: result.messageTs,
        },
        update: {
          slackChannelId: result.channelId,
          slackMessageTs: result.messageTs,
        },
      })
    })

    return true
  } catch (error: any) {
    console.error(`[Slack PCN] Error notifying for appointment ${appointmentId}:`, error)
    return false
  }
}

/**
 * Notify that a PCN has been completed
 */
export async function notifyPCNCompleted(appointmentId: string): Promise<boolean> {
  try {
    const slackMessage = await withPrisma(async (prisma) => {
      return await prisma.slackMessage.findUnique({
        where: { appointmentId },
        include: {
          appointment: {
            include: {
              pcnSubmittedBy: {
                select: {
                  name: true,
                },
              },
            },
          },
        },
      })
    })

    if (!slackMessage) {
      // No Slack message was sent for this appointment, nothing to update
      return true
    }

    const closerName = slackMessage.appointment.pcnSubmittedBy?.name || 'Unknown'
    const completedAt = slackMessage.appointment.pcnSubmittedAt
      ? new Date(slackMessage.appointment.pcnSubmittedAt).toLocaleString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
        })
      : 'just now'

    const message = `✅ PCN completed by ${closerName} at ${completedAt}`

    const success = await postThreadMessage(
      slackMessage.companyId,
      slackMessage.slackChannelId,
      slackMessage.slackMessageTs,
      message
    )

    return success
  } catch (error: any) {
    console.error(`[Slack PCN] Error notifying completion for appointment ${appointmentId}:`, error)
    return false
  }
}

