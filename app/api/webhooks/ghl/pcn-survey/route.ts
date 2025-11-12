import { NextRequest, NextResponse } from 'next/server'
import { withPrisma } from '@/lib/db'
import { submitPCN } from '@/lib/pcn-submission'
import { PCNSubmission } from '@/types/pcn'

const FIELD_MAP = {
  appointmentId: [
    'pcn-appointment-id',
    'pcn_appointment_id',
    'pcn appointment id',
    'appointmentid',
    'appointment_id',
    'appointment id',
    'call notes - appointment id',
    'calendar.appointmentid'
  ],
  callOutcome: [
    'pcn - call outcome',
    'call outcome',
    'pcn_call_outcome',
    'outcome',
    'callnotes-calloutcome',
    'status'
  ],
  notes: ['notes', 'pcn - notes', 'pcn_notes', 'call notes - signed notes'],
  why: [
    'pcn - why didn\'t the prospect move forward?',
    'pcn - why didnt the prospect move forward?',
    'why didn\'t the prospect move forward?',
    'why didnt move forward',
    'pcn_why_didnt_move_forward'
  ],
  nurtureType: [
    'pcn - nurture type',
    'pcn_nurture_type',
    'nurture type'
  ],
  followUpScheduled: [
    'pcn - was a follow up scheduled?',
    'pcn_was_follow_up_scheduled',
    'was a follow up scheduled',
    'follow up scheduled'
  ],
  followUpDate: [
    'pcn - submission date',
    'pcn submission date',
    'follow up date',
    'pcn_follow_up_date'
  ],
  cashCollected: [
    'pcn - cash collected',
    'pcn_cash_collected',
    'cash collected'
  ],
  offerMade: [
    'call notes - did you make an offer?',
    'pcn - did you make an offer?',
    'pcn_did_you_make_an_offer',
    'did you make an offer'
  ],
  noShowCommunicative: [
    'pcn - was the no show communicative?',
    'pcn_was_no_show_communicative',
    'was the no show communicative',
    'call notes - was the no show communicative?'
  ],
  cancellationReason: [
    'pcn - cancellation reason',
    'pcn_cancellation_reason',
    'cancellation reason',
    'call notes - cancellation reason'
  ],
  disqualificationReason: [
    'pcn - dq reason',
    'pcn_dq_reason',
    'dq reason'
  ],
  qualificationStatus: [
    'pcn - qualification status',
    'pcn_qualification_status',
    'qualification status'
  ]
}

const BOOLEAN_TRUE_VALUES = ['yes', 'true', '1', 'y']
const BOOLEAN_FALSE_VALUES = ['no', 'false', '0', 'n']

function normalizeKey(key: string): string {
  return key.replace(/[\s_-]+/g, '').toLowerCase()
}

function extractField<T = string>(
  payload: Record<string, any>,
  candidates: string[]
): T | undefined {
  const map = new Map<string, any>()
  Object.entries(payload).forEach(([key, value]) => {
    map.set(normalizeKey(key), value)
  })

  for (const name of candidates) {
    const normalized = normalizeKey(name)
    if (map.has(normalized)) {
      return map.get(normalized) as T
    }
  }
  return undefined
}

function parseBoolean(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value
  if (value === null || value === undefined) return undefined
  if (typeof value === 'number') return value > 0
  const normalized = String(value).trim().toLowerCase()
  if (BOOLEAN_TRUE_VALUES.includes(normalized)) return true
  if (BOOLEAN_FALSE_VALUES.includes(normalized)) return false
  return undefined
}

function parseCash(value: unknown): number | undefined {
  if (typeof value === 'number') return value
  if (typeof value !== 'string') return undefined
  const numeric = value.replace(/[^\d.]/g, '')
  if (!numeric) return undefined
  const parsed = parseFloat(numeric)
  return Number.isNaN(parsed) ? undefined : parsed
}

function flattenPayload(payload: any, prefix = ''): Record<string, any> {
  if (!payload || typeof payload !== 'object') return {}
  return Object.entries(payload).reduce<Record<string, any>>((acc, [key, value]) => {
    const newKey = prefix ? `${prefix}.${key}` : key
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      Object.assign(acc, flattenPayload(value, newKey))
    } else {
      acc[newKey] = value
    }
    return acc
  }, {})
}

export async function POST(request: NextRequest) {
  try {
    const url = new URL(request.url)
    const companyId = url.searchParams.get('company')
    const secret = url.searchParams.get('secret')

    if (!companyId || !secret) {
      return NextResponse.json(
        { error: 'Missing company or secret query parameters' },
        { status: 400 }
      )
    }

    const rawBody = await request.text()
    let payload: Record<string, any>
    try {
      payload = JSON.parse(rawBody)
    } catch (error: any) {
      console.error('[PCN Survey] Failed to parse JSON payload:', error)
      return NextResponse.json(
        { error: 'Invalid JSON payload' },
        { status: 400 }
      )
    }

    const flattened = flattenPayload(payload)

    const result = await withPrisma(async (prisma) => {
      const company = await prisma.company.findUnique({
        where: { id: companyId },
        select: {
          id: true,
          name: true,
          ghlWebhookSecret: true
        }
      })

      if (!company) {
        return NextResponse.json(
          { error: 'Company not found' },
          { status: 404 }
        )
      }

      const logFailure = async (
        status: number,
        message: string,
        extra: Record<string, any> = {}
      ) => {
        try {
          await prisma.webhookEvent.create({
            data: {
              processor: 'ghl',
              eventType: 'pcn.survey.error',
              companyId: company.id,
              payload: {
                raw: payload,
                message,
                ...extra
              },
              processed: false,
              processedAt: new Date()
            }
          })
        } catch (logError) {
          console.error('[PCN Survey] Failed to record webhook error event:', logError)
        }

        return NextResponse.json({ error: message, ...extra }, { status })
      }

      if (!company.ghlWebhookSecret || company.ghlWebhookSecret !== secret) {
        return logFailure(403, 'Invalid secret')
      }

      const rawAppointmentId =
        extractField<string>(flattened, FIELD_MAP.appointmentId) ||
        flattened['appointment.id'] ||
        flattened['data.appointmentId'] ||
        payload['appointmentId']

      const appointmentId = typeof rawAppointmentId === 'string' ? rawAppointmentId.trim() : ''

      if (!appointmentId) {
        return logFailure(400, 'Appointment ID not found in payload')
      }

      const rawOutcome =
        (extractField<string>(flattened, FIELD_MAP.callOutcome) || '').trim().toLowerCase()
      const normalizedOutcome = rawOutcome.replace(/[_\s-]+/g, '_')

      const outcomeAliases: Record<string, PCNSubmission['callOutcome']> = {
        showed: 'showed',
        show: 'showed',
        'showed - won': 'showed',
        signed: 'signed',
        sale: 'signed',
        closed: 'signed',
        'contract sent': 'contract_sent',
        contract_sent: 'contract_sent',
        'no show': 'no_show',
        'no_show': 'no_show',
        'no-show': 'no_show',
        'no-showed': 'no_show',
        'no_showed': 'no_show',
        'no showed': 'no_show',
        noshow: 'no_show',
        cancelled: 'cancelled',
        canceled: 'cancelled'
      }

      const canonicalOutcome =
        outcomeAliases[normalizedOutcome as keyof typeof outcomeAliases] ??
        (normalizedOutcome as PCNSubmission['callOutcome'])

      const allowedOutcomes: PCNSubmission['callOutcome'][] = [
        'showed',
        'signed',
        'no_show',
        'contract_sent',
        'cancelled'
      ]

      if (!canonicalOutcome || !allowedOutcomes.includes(canonicalOutcome)) {
        return logFailure(400, 'Unsupported or missing call outcome in payload', {
          outcome: rawOutcome
        })
      }

      const submission: PCNSubmission = {
        callOutcome: canonicalOutcome,
        notes: extractField<string>(flattened, FIELD_MAP.notes) || '',
        whyDidntMoveForward: extractField<string>(flattened, FIELD_MAP.why) || undefined,
        nurtureType: extractField<string>(flattened, FIELD_MAP.nurtureType) as any,
        followUpScheduled:
          parseBoolean(extractField(flattened, FIELD_MAP.followUpScheduled)) ?? false,
        followUpDate: extractField<string>(flattened, FIELD_MAP.followUpDate) || undefined,
        cashCollected: parseCash(extractField(flattened, FIELD_MAP.cashCollected)),
        wasOfferMade: parseBoolean(extractField(flattened, FIELD_MAP.offerMade)) ?? false,
        cancellationReason: extractField<string>(flattened, FIELD_MAP.cancellationReason) || undefined,
        disqualificationReason: extractField<string>(flattened, FIELD_MAP.disqualificationReason) || undefined,
        qualificationStatus: extractField<string>(flattened, FIELD_MAP.qualificationStatus) as any
      }

      if (
        (!submission.cancellationReason ||
          (typeof submission.cancellationReason === 'string' &&
            submission.cancellationReason.trim().length === 0)) &&
        canonicalOutcome === 'cancelled'
      ) {
        const fallbackCancellation =
          flattened['Call Notes - Cancellation Reason'] ||
          flattened['call notes - cancellation reason'] ||
          flattened['PCN - Cancellation Reason'] ||
          flattened['pcn - cancellation reason'] ||
          flattened['cancellation reason'] ||
          payload['Call Notes - Cancellation Reason'] ||
          payload['PCN - Cancellation Reason'] ||
          payload['cancellation reason']

        if (typeof fallbackCancellation === 'string') {
          const trimmed = fallbackCancellation.trim()
          if (trimmed.length > 0) {
            submission.cancellationReason = trimmed
          }
        }
      }

      const rawNoShowCommunicative = extractField<string>(
        flattened,
        FIELD_MAP.noShowCommunicative
      )

      if (rawNoShowCommunicative !== undefined) {
        if (typeof rawNoShowCommunicative === 'string') {
          const normalized = rawNoShowCommunicative.trim().toLowerCase()
          if (!normalized) {
            submission.noShowCommunicative = false
          } else if (
            ['yes', 'communicative', 'y'].includes(normalized) ||
            normalized.startsWith('communicative')
          ) {
            submission.noShowCommunicative = true
          } else if (
            ['no', 'not communicative', 'n', 'non-communicative'].includes(normalized) ||
            normalized.startsWith('not communicative')
          ) {
            submission.noShowCommunicative = false
          } else {
            submission.noShowCommunicative = parseBoolean(normalized) ?? false
          }
        } else {
          submission.noShowCommunicative =
            parseBoolean(rawNoShowCommunicative) ?? false
        }
      } else {
        submission.noShowCommunicative = false
      }

      if (canonicalOutcome === 'showed' && !submission.firstCallOrFollowUp) {
        submission.firstCallOrFollowUp = submission.followUpScheduled ? 'follow_up' : 'first_call'
      }

      let result
      try {
        result = await submitPCN({
          appointmentId,
          companyId: company.id,
          submission,
          actorUserId: null,
          actorName: 'GHL Survey Automation'
        })
      } catch (submitError: any) {
        console.error('[PCN Survey] submitPCN failed:', submitError)
        return logFailure(500, 'Failed to submit PCN', {
          details: submitError?.message || 'Unknown error',
          appointmentId
        })
      }

      await prisma.webhookEvent.create({
        data: {
          processor: 'ghl',
          eventType: 'pcn.survey.received',
          companyId: company.id,
          payload: {
            raw: payload,
            appointmentId,
            outcome: canonicalOutcome
          },
          processed: true,
          processedAt: new Date()
        }
      })

      return NextResponse.json({
        success: true,
        appointment: result.appointment
      })
    })

    return result
  } catch (error: any) {
    console.error('[PCN Survey] Error processing survey webhook:', error)
    return NextResponse.json(
      { error: 'Failed to process PCN survey', details: error.message },
      { status: 500 }
    )
  }
}

