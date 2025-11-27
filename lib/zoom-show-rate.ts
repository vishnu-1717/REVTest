import { withPrisma } from './db'
import { createZoomClient } from './zoom-api'

export interface ZoomMeetingInfo {
  id: string
  uuid: string
  start_time: string
  duration: number
  participant_count: number
  host_email?: string
  participants?: Array<{ email?: string }>
}

/**
 * Automatically update appointment show rate based on Zoom meeting data
 * Updates appointment status to "showed" or "no_show" based on meeting duration and participants
 */
export async function updateShowRateFromZoom(
  meetingId: string,
  companyId: string
): Promise<{ success: boolean; statusUpdated?: boolean; appointmentId?: string; error?: string }> {
  try {
    const zoomClient = await createZoomClient(companyId)
    if (!zoomClient) {
      return {
        success: false,
        error: 'Zoom not configured for this company'
      }
    }

    // Get meeting details
    const meeting = await zoomClient.getMeeting(meetingId)
    if (!meeting) {
      return {
        success: false,
        error: 'Meeting not found'
      }
    }

    // Find matching appointment
    const appointment = await withPrisma(async (prisma) => {
      // Try to find by zoomMeetingId
      let appointment = await prisma.appointment.findFirst({
        where: {
          companyId,
          OR: [
            { zoomMeetingId: meetingId },
            {
              customFields: {
                path: ['zoomMeetingId'],
                equals: meetingId
              }
            }
          ]
        }
      })

      // If not found, try matching by time and contact/closer
      if (!appointment && meeting.start_time) {
        const meetingStartTime = new Date(meeting.start_time)
        const windowStart = new Date(meetingStartTime.getTime() - 2 * 60 * 60 * 1000)
        const windowEnd = new Date(meetingStartTime.getTime() + 2 * 60 * 60 * 1000)

        // Try by contact email
        if (meeting.host_email) {
          const contact = await prisma.contact.findFirst({
            where: {
              companyId,
              email: meeting.host_email.toLowerCase()
            }
          })

          if (contact) {
            appointment = await prisma.appointment.findFirst({
              where: {
                companyId,
                contactId: contact.id,
                scheduledAt: {
                  gte: windowStart,
                  lte: windowEnd
                }
              },
              orderBy: { scheduledAt: 'desc' }
            })
          }
        }
      }

      return appointment
    })

    if (!appointment) {
      return {
        success: false,
        error: 'Could not match meeting to appointment'
      }
    }

    // Determine if meeting actually happened
    // Criteria:
    // - Meeting duration > 1 minute = showed
    // - Participant count >= 2 (host + at least one participant) = showed
    // - Otherwise = no_show
    const meetingDuration = meeting.duration || 0 // Duration in minutes
    const participantCount = meeting.participant_count || 0

    const didShow = meetingDuration > 1 || participantCount >= 2

    // Update appointment status
    await withPrisma(async (prisma) => {
      const newStatus = didShow ? 'showed' : 'no_show'
      
      // Only update if status hasn't been manually set to something else
      // Don't overwrite "signed" or "cancelled" statuses
      if (appointment.status === 'scheduled' || appointment.status === 'booked') {
        await prisma.appointment.update({
          where: { id: appointment.id },
          data: {
            status: newStatus,
            // Store meeting info for reference
            zoomMeetingId: meetingId,
            zoomMeetingUuid: meeting.uuid,
            customFields: {
              ...((appointment.customFields as Record<string, any>) || {}),
              zoomMeetingDuration: meetingDuration,
              zoomParticipantCount: participantCount,
              zoomShowRateUpdatedAt: new Date().toISOString()
            }
          }
        })

        console.log(`[Zoom Show Rate] Updated appointment ${appointment.id} to ${newStatus} (duration: ${meetingDuration}min, participants: ${participantCount})`)
      } else {
        console.log(`[Zoom Show Rate] Appointment ${appointment.id} already has status ${appointment.status}, not updating`)
      }
    })

    return {
      success: true,
      statusUpdated: didShow,
      appointmentId: appointment.id
    }
  } catch (error: any) {
    console.error('[Zoom Show Rate] Error:', error)
    return {
      success: false,
      error: error.message || 'Failed to update show rate'
    }
  }
}

