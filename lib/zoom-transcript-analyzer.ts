import { withPrisma } from './db'
import { createZoomClient, ZoomClient } from './zoom-api'
import { analyzeCallTranscript } from './openai-client'
import { submitPCN } from './pcn-submission'
import { PCNSubmission } from '@/types/pcn'

export interface AnalyzeZoomRecordingResult {
  success: boolean
  pcnSubmitted?: boolean
  appointmentId?: string
  error?: string
  aiGenerated?: boolean
}

/**
 * Analyze Zoom recording and generate PCN
 * Matches meeting to appointment, downloads transcript, analyzes with AI, and optionally submits PCN
 */
export async function analyzeZoomRecording(
  meetingId: string,
  companyId: string,
  transcript?: string
): Promise<AnalyzeZoomRecordingResult> {
  try {
    // Get Zoom client
    const zoomClient = await createZoomClient(companyId)
    if (!zoomClient) {
      return {
        success: false,
        error: 'Zoom not configured for this company'
      }
    }

    // Download transcript if not provided
    let transcriptText = transcript
    if (!transcriptText) {
      const recordings = await zoomClient.getMeetingRecordings(meetingId)
      const transcriptRecording = recordings.find(r => r.file_type === 'TRANSCRIPT' || r.file_extension === 'vtt')
      
      if (!transcriptRecording) {
        return {
          success: false,
          error: 'No transcript found for this meeting'
        }
      }

      transcriptText = await zoomClient.downloadTranscript(transcriptRecording.download_url)
    }

    // Find matching appointment
    const appointment = await findMatchingAppointment(meetingId, companyId, zoomClient)
    if (!appointment) {
      return {
        success: false,
        error: 'Could not match Zoom meeting to appointment'
      }
    }

    // Get appointment data for AI context
    const appointmentData = await withPrisma(async (prisma) => {
      const fullAppointment = await prisma.appointment.findUnique({
        where: { id: appointment.id },
        include: {
          contact: true,
          closer: true,
          calendarRelation: true
        }
      })

      if (!fullAppointment) {
        return null
      }

      return {
        id: fullAppointment.id,
        scheduledAt: fullAppointment.scheduledAt,
        contactName: fullAppointment.contact.name,
        contactEmail: fullAppointment.contact.email,
        closerName: fullAppointment.closer?.name || null,
        calendarName: fullAppointment.calendarRelation?.name || null
      }
    })

    if (!appointmentData) {
      return {
        success: false,
        error: 'Appointment not found'
      }
    }

    // Analyze transcript with OpenAI
    const pcnSubmission = await analyzeCallTranscript(transcriptText, appointmentData)

    // Store transcript in appointment
    await withPrisma(async (prisma) => {
      await prisma.appointment.update({
        where: { id: appointment.id },
        data: {
          zoomTranscript: transcriptText,
          zoomTranscriptAnalyzedAt: new Date()
        }
      })
    })

    // Log AI generation
    const { logAIGeneratedPCN } = await import('./pcn-changelog')
    await logAIGeneratedPCN(
      appointment.id,
      companyId,
      pcnSubmission,
      'PCN generated from Zoom transcript analysis'
    )

    // Check if auto-submit is enabled
    const company = await withPrisma(async (prisma) => {
      return await prisma.company.findUnique({
        where: { id: companyId },
        select: { 
          zoomAutoSubmitPCN: true,
          slackConnectedAt: true,
          slackChannelId: true
        }
      })
    })

    let pcnSubmitted = false
    if (company?.zoomAutoSubmitPCN) {
      // Auto-submit PCN
      await submitPCN({
        appointmentId: appointment.id,
        companyId,
        submission: pcnSubmission,
        actorUserId: null,
        actorName: 'Zoom AI',
        strictValidation: false // AI-generated, may not have all fields
      })
      pcnSubmitted = true
    } else {
      // Store AI-generated PCN data in appointment for review
      await withPrisma(async (prisma) => {
        await prisma.appointment.update({
          where: { id: appointment.id },
          data: {
            // Store AI-generated PCN data in customFields for review
            customFields: {
              ...((appointment.customFields as Record<string, any>) || {}),
              aiGeneratedPCN: pcnSubmission as any,
              aiGeneratedPCNAt: new Date().toISOString()
            } as any
          }
        })
      })

      // Send to Slack for review if Slack is connected
      if (company?.slackConnectedAt) {
        try {
          const { sendPCNNotification } = await import('./slack-client')
          const fullAppointment = await withPrisma(async (prisma) => {
            return await prisma.appointment.findUnique({
              where: { id: appointment.id },
              include: {
                contact: true,
                closer: {
                  select: {
                    id: true,
                    name: true,
                    slackUserId: true
                  }
                }
              }
            })
          })

          if (fullAppointment) {
            await sendPCNNotification(
              companyId,
              {
                id: fullAppointment.id,
                contact: {
                  name: fullAppointment.contact.name,
                  email: fullAppointment.contact.email
                },
                closer: fullAppointment.closer ? {
                  id: fullAppointment.closer.id,
                  name: fullAppointment.closer.name,
                  slackUserId: fullAppointment.closer.slackUserId
                } : null,
                scheduledAt: fullAppointment.scheduledAt
              },
              company.slackChannelId || undefined,
              {
                aiGenerated: true,
                pcnData: pcnSubmission
              }
            )
            console.log(`[Zoom AI] Sent AI-generated PCN to Slack for review (appointment ${appointment.id})`)
          }
        } catch (slackError: any) {
          console.error('[Zoom AI] Error sending PCN to Slack:', slackError)
          // Don't fail the whole process if Slack notification fails
        }
      }
    }

    return {
      success: true,
      pcnSubmitted,
      appointmentId: appointment.id,
      aiGenerated: true
    }
  } catch (error: any) {
    console.error('[Zoom Transcript Analyzer] Error:', error)
    return {
      success: false,
      error: error.message || 'Failed to analyze recording'
    }
  }
}

/**
 * Find appointment matching Zoom meeting
 * Tries multiple strategies:
 * 1. Match by zoomMeetingId stored in appointment
 * 2. Match by contact email + scheduled time window
 * 3. Match by closer email + scheduled time window
 */
async function findMatchingAppointment(
  meetingId: string,
  companyId: string,
  zoomClient: ZoomClient
): Promise<{ id: string; customFields: any } | null> {
  return await withPrisma(async (prisma) => {
    // Strategy 1: Match by zoomMeetingId
    const byMeetingId = await prisma.appointment.findFirst({
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
      },
      select: { id: true, customFields: true }
    })

    if (byMeetingId) {
      return byMeetingId
    }

    // Strategy 2: Get meeting details and match by contact email + time
    try {
      const meeting = await zoomClient.getMeeting(meetingId)
      if (!meeting) {
        return null
      }

      const meetingStartTime = meeting.start_time ? new Date(meeting.start_time) : null
      if (!meetingStartTime) {
        return null
      }

      // Try to find contact email from meeting participants or host
      const hostEmail = meeting.host_email
      const participantEmails = meeting.participants?.map((p: any) => p.email).filter(Boolean) || []

      // Search window: ±2 hours from meeting start
      const windowStart = new Date(meetingStartTime.getTime() - 2 * 60 * 60 * 1000)
      const windowEnd = new Date(meetingStartTime.getTime() + 2 * 60 * 60 * 1000)

      // Strategy 2a: Match by contact email + time window
      if (hostEmail || participantEmails.length > 0) {
        const emailsToTry = hostEmail ? [hostEmail, ...participantEmails] : participantEmails
        
        for (const email of emailsToTry) {
          const byEmail = await prisma.appointment.findFirst({
            where: {
              companyId,
              scheduledAt: {
                gte: windowStart,
                lte: windowEnd
              },
              contact: {
                email: email.toLowerCase()
              }
            },
            select: { id: true, customFields: true },
            orderBy: { scheduledAt: 'desc' }
          })

          if (byEmail) {
            // Store meeting ID for future matches
            await prisma.appointment.update({
              where: { id: byEmail.id },
              data: {
                zoomMeetingId: meetingId,
                zoomMeetingUuid: meeting.uuid
              }
            })
            return byEmail
          }
        }
      }

      // Strategy 2b: Match by closer email + time window
      if (hostEmail) {
        const closer = await prisma.user.findFirst({
          where: {
            companyId,
            email: hostEmail.toLowerCase()
          },
          select: { id: true }
        })

        if (closer) {
          const byCloser = await prisma.appointment.findFirst({
            where: {
              companyId,
              closerId: closer.id,
              scheduledAt: {
                gte: windowStart,
                lte: windowEnd
              }
            },
            select: { id: true, customFields: true },
            orderBy: { scheduledAt: 'desc' }
          })

          if (byCloser) {
            // Store meeting ID for future matches
            await prisma.appointment.update({
              where: { id: byCloser.id },
              data: {
                zoomMeetingId: meetingId,
                zoomMeetingUuid: meeting.uuid
              }
            })
            return byCloser
          }
        }
      }
    } catch (error) {
      console.error('[Zoom Transcript Analyzer] Error getting meeting details:', error)
    }

    return null
  })
}

