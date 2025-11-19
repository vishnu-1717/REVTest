import { withPrisma } from './db'
import { sendPCNNotification, postThreadMessage } from './slack-client'

/**
 * Notify about a pending PCN via Slack
 * Enhanced with detailed logging and audit trail
 */
export async function notifyPendingPCN(appointmentId: string): Promise<boolean> {
  let logRecord: any = {
    appointmentId,
    status: 'pending',
    createdAt: new Date(),
  }

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
      const errorMsg = `Appointment ${appointmentId} not found`
      console.warn(`[Slack PCN] ${errorMsg}`)
      
      // Log failed attempt
      await withPrisma(async (prisma) => {
        await prisma.slackMessage.upsert({
          where: { appointmentId },
          create: {
            appointmentId,
            companyId: '', // Will be set if we can find appointment
            status: 'failed',
            errorMessage: errorMsg,
            failedAt: new Date(),
          },
          update: {
            status: 'failed',
            errorMessage: errorMsg,
            failedAt: new Date(),
            retryCount: { increment: 1 },
          },
        })
      })
      return false
    }

    // Store appointment details for logging
    logRecord.companyId = appointment.companyId
    logRecord.contactName = appointment.contact.name
    logRecord.contactEmail = appointment.contact.email
    logRecord.scheduledAt = appointment.scheduledAt
    logRecord.closerId = appointment.closer?.id || null
    logRecord.closerName = appointment.closer?.name || null

    // Check if company has Slack connected
    if (!appointment.company.slackConnectedAt) {
      const errorMsg = `Company ${appointment.companyId} does not have Slack connected`
      console.log(`[Slack PCN] ${errorMsg}`)
      
      // Log failed attempt
      await withPrisma(async (prisma) => {
        await prisma.slackMessage.upsert({
          where: { appointmentId: appointment.id },
          create: {
            appointmentId: appointment.id,
            companyId: appointment.companyId,
            status: 'failed',
            errorMessage: errorMsg,
            contactName: appointment.contact.name,
            contactEmail: appointment.contact.email,
            scheduledAt: appointment.scheduledAt,
            closerId: appointment.closer?.id || null,
            closerName: appointment.closer?.name || null,
            failedAt: new Date(),
          },
          update: {
            status: 'failed',
            errorMessage: errorMsg,
            failedAt: new Date(),
            retryCount: { increment: 1 },
          },
        })
      })
      return false
    }

    // Check if closer has Slack user ID mapped
    if (!appointment.closer?.slackUserId) {
      const errorMsg = `Closer ${appointment.closerId} does not have Slack user ID mapped`
      console.warn(`[Slack PCN] ${errorMsg} for appointment ${appointmentId}`)
      
      // Log failed attempt
      await withPrisma(async (prisma) => {
        await prisma.slackMessage.upsert({
          where: { appointmentId: appointment.id },
          create: {
            appointmentId: appointment.id,
            companyId: appointment.companyId,
            status: 'failed',
            errorMessage: errorMsg,
            contactName: appointment.contact.name,
            contactEmail: appointment.contact.email,
            scheduledAt: appointment.scheduledAt,
            closerId: appointment.closer?.id || null,
            closerName: appointment.closer?.name || null,
            failedAt: new Date(),
          },
          update: {
            status: 'failed',
            errorMessage: errorMsg,
            failedAt: new Date(),
            retryCount: { increment: 1 },
          },
        })
      })
      return false
    }

    // Determine channel type for logging
    const channelType = appointment.company.slackChannelId ? 'default_channel' : 'dm'
    logRecord.channelType = channelType

    // Send notification and get message content
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
      const errorMsg = 'Failed to send notification to Slack'
      console.error(`[Slack PCN] ${errorMsg} for appointment ${appointmentId}`)
      
      // Log failed attempt
      await withPrisma(async (prisma) => {
        await prisma.slackMessage.upsert({
          where: { appointmentId: appointment.id },
          create: {
            appointmentId: appointment.id,
            companyId: appointment.companyId,
            status: 'failed',
            errorMessage: errorMsg,
            contactName: appointment.contact.name,
            contactEmail: appointment.contact.email,
            scheduledAt: appointment.scheduledAt,
            closerId: appointment.closer?.id || null,
            closerName: appointment.closer?.name || null,
            channelType,
            failedAt: new Date(),
          },
          update: {
            status: 'failed',
            errorMessage: errorMsg,
            failedAt: new Date(),
            retryCount: { increment: 1 },
          },
        })
      })
      return false
    }

    // Build message content for logging
    const scheduledTime = new Date(appointment.scheduledAt).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short',
    })
    const pcnUrl = `https://app.revphlo.com/pcn/${appointment.id}`
    let messageContent = `📋 *PCN Required*\n\n`
    messageContent += `*Prospect:* ${appointment.contact.name}\n`
    if (appointment.contact.email) {
      messageContent += `*Email:* ${appointment.contact.email}\n`
    }
    messageContent += `*Scheduled:* ${scheduledTime}\n\n`
    messageContent += `<${pcnUrl}|Fill out PCN →>`
    if (appointment.closer?.slackUserId) {
      messageContent = `<@${appointment.closer.slackUserId}> ${messageContent}`
    }

    // Store successful message in database with full audit trail
    await withPrisma(async (prisma) => {
      await prisma.slackMessage.upsert({
        where: { appointmentId: appointment.id },
        create: {
          appointmentId: appointment.id,
          companyId: appointment.companyId,
          slackChannelId: result.channelId,
          slackMessageTs: result.messageTs,
          status: 'sent',
          messageContent,
          contactName: appointment.contact.name,
          contactEmail: appointment.contact.email,
          scheduledAt: appointment.scheduledAt,
          closerId: appointment.closer?.id || null,
          closerName: appointment.closer?.name || null,
          channelType,
          sentAt: new Date(),
        },
        update: {
          slackChannelId: result.channelId,
          slackMessageTs: result.messageTs,
          status: 'sent',
          messageContent,
          contactName: appointment.contact.name,
          contactEmail: appointment.contact.email,
          scheduledAt: appointment.scheduledAt,
          closerId: appointment.closer?.id || null,
          closerName: appointment.closer?.name || null,
          channelType,
          sentAt: new Date(),
          errorMessage: null, // Clear any previous errors
          failedAt: null,
        },
      })
    })

    return true
  } catch (error: any) {
    const errorMsg = error.message || 'Unknown error occurred'
    console.error(`[Slack PCN] Error notifying for appointment ${appointmentId}:`, error)
    
    // Log error to database
    try {
      await withPrisma(async (prisma) => {
        await prisma.slackMessage.upsert({
          where: { appointmentId },
          create: {
            appointmentId,
            companyId: logRecord.companyId || '',
            status: 'failed',
            errorMessage: errorMsg,
            contactName: logRecord.contactName || null,
            contactEmail: logRecord.contactEmail || null,
            scheduledAt: logRecord.scheduledAt || null,
            closerId: logRecord.closerId || null,
            closerName: logRecord.closerName || null,
            channelType: logRecord.channelType || null,
            failedAt: new Date(),
          },
          update: {
            status: 'failed',
            errorMessage: errorMsg,
            failedAt: new Date(),
            retryCount: { increment: 1 },
          },
        })
      })
    } catch (dbError) {
      console.error('[Slack PCN] Error logging to database:', dbError)
    }
    
    return false
  }
}

/**
 * Notify that a PCN has been completed
 * Enhanced with logging for completion attempts
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
      // Log this case for debugging
      console.log(`[Slack PCN] No Slack message found for appointment ${appointmentId}, skipping completion notification`)
      return true
    }

    // Check if we have required fields for posting
    if (!slackMessage.slackChannelId || !slackMessage.slackMessageTs) {
      const errorMsg = 'Missing Slack channel or message timestamp for completion notification'
      console.error(`[Slack PCN] ${errorMsg} for appointment ${appointmentId}`)
      
      // Update record with error
      await withPrisma(async (prisma) => {
        await prisma.slackMessage.update({
          where: { appointmentId },
          data: {
            errorMessage: errorMsg,
            failedAt: new Date(),
          },
        })
      })
      return false
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

    // Log completion attempt
    if (success) {
      await withPrisma(async (prisma) => {
        await prisma.slackMessage.update({
          where: { appointmentId },
          data: {
            // Store completion message in thread timestamp if we want to track it
            // For now, we just clear any previous errors
            errorMessage: null,
            failedAt: null,
          },
        })
      })
    } else {
      const errorMsg = 'Failed to post completion message to Slack thread'
      await withPrisma(async (prisma) => {
        await prisma.slackMessage.update({
          where: { appointmentId },
          data: {
            errorMessage: errorMsg,
            failedAt: new Date(),
          },
        })
      })
    }

    return success
  } catch (error: any) {
    const errorMsg = error.message || 'Unknown error occurred'
    console.error(`[Slack PCN] Error notifying completion for appointment ${appointmentId}:`, error)
    
    // Log error to database
    try {
      await withPrisma(async (prisma) => {
        await prisma.slackMessage.update({
          where: { appointmentId },
          data: {
            errorMessage: `Completion notification error: ${errorMsg}`,
            failedAt: new Date(),
          },
        })
      })
    } catch (dbError) {
      console.error('[Slack PCN] Error logging completion error to database:', dbError)
    }
    
    return false
  }
}

