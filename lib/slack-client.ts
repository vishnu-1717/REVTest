import { WebClient } from '@slack/web-api'
import { withPrisma } from './db'

/**
 * Get authenticated Slack client for a company
 */
export async function getSlackClient(companyId: string): Promise<WebClient | null> {
  const company = await withPrisma(async (prisma) => {
    return await prisma.company.findUnique({
      where: { id: companyId },
      select: {
        slackBotToken: true,
        slackWorkspaceId: true,
      },
    })
  })

  if (!company?.slackBotToken) {
    console.warn(`[Slack] No bot token found for company ${companyId}`)
    return null
  }

  return new WebClient(company.slackBotToken)
}

/**
 * Send PCN notification message to Slack
 */
export async function sendPCNNotification(
  companyId: string,
  appointment: {
    id: string
    contact: { name: string; email: string | null }
    closer: { id: string; name: string; slackUserId: string | null } | null
    scheduledAt: Date
  },
  channelId?: string
): Promise<{ channelId: string; messageTs: string } | null> {
  const client = await getSlackClient(companyId)
  if (!client) {
    console.warn(`[Slack] Cannot send notification - no client for company ${companyId}`)
    return null
  }

  // Get company to check for default channel
  const company = await withPrisma(async (prisma) => {
    return await prisma.company.findUnique({
      where: { id: companyId },
      select: {
        slackChannelId: true,
      },
    })
  })

  // Determine channel - use provided, default, or DM to closer
  let targetChannelId = channelId || company?.slackChannelId

  // If no channel specified and closer has Slack ID, try to DM them
  if (!targetChannelId && appointment.closer?.slackUserId) {
    try {
      // Open DM channel with closer
      const dmResponse = await client.conversations.open({
        users: appointment.closer.slackUserId,
      })
      if (dmResponse.ok && dmResponse.channel?.id) {
        targetChannelId = dmResponse.channel.id
      }
    } catch (err) {
      console.error('[Slack] Error opening DM:', err)
    }
  }

  if (!targetChannelId) {
    console.error('[Slack] No channel available for notification')
    return null
  }

  // Build message
  const pcnUrl = `https://app.revphlo.com/pcn/${appointment.id}`
  const scheduledTime = new Date(appointment.scheduledAt).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  })

  let messageText = `📋 *PCN Required*\n\n`
  messageText += `*Prospect:* ${appointment.contact.name}\n`
  if (appointment.contact.email) {
    messageText += `*Email:* ${appointment.contact.email}\n`
  }
  messageText += `*Scheduled:* ${scheduledTime}\n\n`
  messageText += `<${pcnUrl}|Fill out PCN →>`

  // Tag closer if they have Slack ID
  if (appointment.closer?.slackUserId) {
    messageText = `<@${appointment.closer.slackUserId}> ${messageText}`
  }

  try {
    const response = await client.chat.postMessage({
      channel: targetChannelId,
      text: messageText,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: messageText,
          },
        },
        {
          type: 'actions',
          elements: [
            {
              type: 'button',
              text: {
                type: 'plain_text',
                text: 'Fill out PCN',
              },
              url: pcnUrl,
              style: 'primary',
            },
          ],
        },
      ],
    })

    if (!response.ok) {
      const errorMsg = response.error ? String(response.error) : 'Unknown error'
      console.error('[Slack] Error posting message:', errorMsg)
      return null
    }

    return {
      channelId: targetChannelId,
      messageTs: response.ts || '',
    }
  } catch (error: any) {
    console.error('[Slack] Error sending notification:', error)
    return null
  }
}

/**
 * Post completion message in Slack thread
 */
export async function postThreadMessage(
  companyId: string,
  channelId: string,
  threadTs: string,
  message: string
): Promise<boolean> {
  const client = await getSlackClient(companyId)
  if (!client) {
    return false
  }

  try {
    const response = await client.chat.postMessage({
      channel: channelId,
      thread_ts: threadTs,
      text: message,
    })

    return response.ok || false
  } catch (error: any) {
    console.error('[Slack] Error posting thread message:', error)
    return false
  }
}

/**
 * Get all Slack users in workspace
 */
export async function getSlackUsers(companyId: string): Promise<
  Array<{
    id: string
    name: string
    real_name: string
    email?: string
    is_bot: boolean
  }>
> {
  const client = await getSlackClient(companyId)
  if (!client) {
    return []
  }

  try {
    const response = await client.users.list({})
    if (!response.ok || !response.members) {
      const errorMsg = response.error ? String(response.error) : 'Unknown error'
      console.error('[Slack] Error fetching users:', errorMsg)
      return []
    }

    // Filter out bots and return user info
    return response.members
      ?.filter((member) => !member.is_bot && !member.deleted && member.id !== 'USLACKBOT')
      .map((member) => ({
        id: member.id || '',
        name: member.name || '',
        real_name: member.real_name || member.name || '',
        email: member.profile?.email,
        is_bot: member.is_bot || false,
      })) || []
  } catch (error: any) {
    console.error('[Slack] Error fetching users:', error)
    return []
  }
}

/**
 * Find Slack user by email
 */
export async function getSlackUserByEmail(
  companyId: string,
  email: string
): Promise<{ id: string; name: string; real_name: string } | null> {
  const users = await getSlackUsers(companyId)
  const normalizedEmail = email.toLowerCase().trim()

  const user = users.find(
    (u) => u.email && u.email.toLowerCase().trim() === normalizedEmail
  )

  if (!user) {
    return null
  }

  return {
    id: user.id,
    name: user.name,
    real_name: user.real_name,
  }
}

/**
 * Get all Slack channels in workspace
 */
export async function getSlackChannels(companyId: string): Promise<
  Array<{
    id: string
    name: string
    is_private: boolean
    is_archived: boolean
  }>
> {
  const client = await getSlackClient(companyId)
  if (!client) {
    return []
  }

  try {
    const response = await client.conversations.list({
      types: 'public_channel,private_channel',
      exclude_archived: true,
    })

    if (!response.ok || !response.channels) {
      const errorMsg = response.error ? String(response.error) : 'Unknown error'
      console.error('[Slack] Error fetching channels:', errorMsg)
      return []
    }

    // Filter out archived channels and return formatted list
    return response.channels
      .filter((channel) => !channel.is_archived)
      .map((channel) => ({
        id: channel.id || '',
        name: channel.name || '',
        is_private: channel.is_private || false,
        is_archived: channel.is_archived || false,
      }))
      .sort((a, b) => a.name.localeCompare(b.name))
  } catch (error: any) {
    console.error('[Slack] Error fetching channels:', error)
    return []
  }
}

