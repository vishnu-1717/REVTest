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
 * Format PCN data for Slack display
 */
export function formatPCNForSlack(pcnData: any): string {
  let formatted = ''
  
  if (pcnData.callOutcome) {
    formatted += `*Outcome:* ${pcnData.callOutcome}\n`
  }
  
  if (pcnData.callOutcome === 'signed') {
    if (pcnData.cashCollected) {
      formatted += `*Cash Collected:* $${pcnData.cashCollected.toFixed(2)}\n`
    }
    if (pcnData.paymentPlanOrPIF) {
      formatted += `*Payment Type:* ${pcnData.paymentPlanOrPIF === 'pif' ? 'Paid in Full' : 'Payment Plan'}\n`
    }
    if (pcnData.paymentPlanOrPIF === 'payment_plan') {
      if (pcnData.totalPrice) {
        formatted += `*Total Price:* $${pcnData.totalPrice.toFixed(2)}\n`
      }
      if (pcnData.numberOfPayments) {
        formatted += `*Number of Payments:* ${pcnData.numberOfPayments}\n`
      }
    }
    if (pcnData.signedNotes) {
      formatted += `*Notes:* ${pcnData.signedNotes}\n`
    }
  }
  
  if (pcnData.callOutcome === 'showed') {
    if (pcnData.qualificationStatus) {
      formatted += `*Qualification:* ${pcnData.qualificationStatus}\n`
    }
    if (pcnData.wasOfferMade !== undefined) {
      formatted += `*Offer Made:* ${pcnData.wasOfferMade ? 'Yes' : 'No'}\n`
    }
    if (pcnData.whyDidntMoveForward) {
      formatted += `*Why Didn't Move Forward:* ${pcnData.whyDidntMoveForward}\n`
    }
    if (pcnData.whyNoOffer) {
      formatted += `*Why No Offer:* ${pcnData.whyNoOffer}\n`
    }
    if (pcnData.downsellOpportunity) {
      formatted += `*Downsell Opportunity:* ${pcnData.downsellOpportunity}\n`
    }
    if (pcnData.disqualificationReason) {
      formatted += `*Disqualification Reason:* ${pcnData.disqualificationReason}\n`
    }
    if (pcnData.followUpScheduled) {
      formatted += `*Follow-up Scheduled:* Yes\n`
      if (pcnData.nurtureType) {
        formatted += `*Nurture Type:* ${pcnData.nurtureType}\n`
      }
    }
  }
  
  if (pcnData.callOutcome === 'no_show') {
    if (pcnData.noShowCommunicative) {
      formatted += `*Communicative:* ${pcnData.noShowCommunicative}\n`
    }
    if (pcnData.noShowCommunicativeNotes) {
      formatted += `*Notes:* ${pcnData.noShowCommunicativeNotes}\n`
    }
  }
  
  if (pcnData.callOutcome === 'cancelled') {
    if (pcnData.cancellationReason) {
      formatted += `*Cancellation Reason:* ${pcnData.cancellationReason}\n`
    }
    if (pcnData.cancellationNotes) {
      formatted += `*Notes:* ${pcnData.cancellationNotes}\n`
    }
  }
  
  if (pcnData.notes) {
    formatted += `*General Notes:* ${pcnData.notes}\n`
  }
  
  return formatted || 'No PCN data available'
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
  channelId?: string,
  options?: {
    aiGenerated?: boolean
    pcnData?: any
  }
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

  const isAIGenerated = options?.aiGenerated || false
  const pcnData = options?.pcnData

  let messageText = isAIGenerated 
    ? `🤖 *AI-Generated PCN - Review Required*\n\n`
    : `📋 *PCN Required*\n\n`
  
  messageText += `*Prospect:* ${appointment.contact.name}\n`
  if (appointment.contact.email) {
    messageText += `*Email:* ${appointment.contact.email}\n`
  }
  messageText += `*Scheduled:* ${scheduledTime}\n\n`

  // If AI-generated, show PCN data
  if (isAIGenerated && pcnData) {
    messageText += `*AI-Generated PCN Data:*\n${formatPCNForSlack(pcnData)}\n\n`
    messageText += `Please review and edit if needed before submitting.`
  } else {
    messageText += `<${pcnUrl}|Fill out PCN →>`
  }

  // Tag closer if they have Slack ID
  if (appointment.closer?.slackUserId) {
    messageText = `<@${appointment.closer.slackUserId}> ${messageText}`
  }

  // Build blocks
  const blocks: any[] = [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: messageText,
      },
    },
  ]

  // Add action buttons
  const actionElements: any[] = []
  
  if (isAIGenerated) {
    // AI-generated PCN: Review & Edit, Approve & Submit buttons
    actionElements.push(
      {
        type: 'button',
        text: {
          type: 'plain_text',
          text: 'Review & Edit',
          emoji: true,
        },
        style: 'primary',
        action_id: 'pcn_review_edit',
        value: appointment.id,
      },
      {
        type: 'button',
        text: {
          type: 'plain_text',
          text: 'Approve & Submit',
          emoji: true,
        },
        style: 'danger',
        action_id: 'pcn_approve_submit',
        value: appointment.id,
        confirm: {
          title: {
            type: 'plain_text',
            text: 'Approve & Submit PCN',
          },
          text: {
            type: 'mrkdwn',
            text: 'Are you sure you want to approve and submit this AI-generated PCN?',
          },
          confirm: {
            type: 'plain_text',
            text: 'Yes, Submit',
          },
          deny: {
            type: 'plain_text',
            text: 'Cancel',
          },
        },
      }
    )
  } else {
    // Regular PCN: Just fill out button
    actionElements.push({
      type: 'button',
      text: {
        type: 'plain_text',
        text: 'Fill out PCN',
      },
      url: pcnUrl,
      style: 'primary',
    })
  }

  blocks.push({
    type: 'actions',
    elements: actionElements,
  })

  try {
    const response = await client.chat.postMessage({
      channel: targetChannelId,
      text: messageText,
      unfurl_links: false, // Disable link unfurling to prevent 404 preview errors
      unfurl_media: false, // Also disable media unfurling
      blocks,
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
 * Handles pagination to fetch all channels across multiple pages
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
    const allChannels: Array<{
      id: string
      name: string
      is_private: boolean
      is_archived: boolean
    }> = []
    
    let cursor: string | undefined = undefined
    let hasMore = true

    // Fetch all pages of channels
    while (hasMore) {
      const response = await client.conversations.list({
        types: 'public_channel,private_channel',
        exclude_archived: true,
        cursor: cursor,
        limit: 200, // Maximum allowed by Slack API
      })

      if (!response.ok) {
        const errorMsg = response.error ? String(response.error) : 'Unknown error'
        console.error('[Slack] Error fetching channels:', errorMsg)
        // Return what we have so far rather than failing completely
        break
      }

      if (response.channels) {
        // Filter out archived channels and add to our list
        const channels = response.channels
          .filter((channel) => !channel.is_archived)
          .map((channel) => ({
            id: channel.id || '',
            name: channel.name || '',
            is_private: channel.is_private || false,
            is_archived: channel.is_archived || false,
          }))
        
        allChannels.push(...channels)
      }

      // Check if there are more pages
      const responseMetadata = response.response_metadata
      if (responseMetadata?.next_cursor) {
        cursor = responseMetadata.next_cursor
        hasMore = cursor.length > 0
      } else {
        hasMore = false
      }
    }

    // Sort all channels alphabetically by name
    return allChannels.sort((a, b) => a.name.localeCompare(b.name))
  } catch (error: any) {
    console.error('[Slack] Error fetching channels:', error)
    return []
  }
}

