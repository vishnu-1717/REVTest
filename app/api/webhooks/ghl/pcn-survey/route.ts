import { NextRequest, NextResponse } from 'next/server'
import { withPrisma } from '@/lib/db'
import { submitPCN } from '@/lib/pcn-submission'
import { PCNSubmission, NoShowCommunicative } from '@/types/pcn'

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
  notes: [
    'notes',
    'pcn - notes',
    'pcn_notes',
    'call notes - signed notes',
    'pcn - fathom notes',
    'call notes - fathom notes'
  ],
  why: [
    'pcn - why didn\'t the prospect move forward?',
    'pcn - why didnt the prospect move forward?',
    'why didn\'t the prospect move forward?',
    'why didnt move forward',
    'pcn_why_didnt_move_forward',
    'call notes - why didn\'t the prospect move forward?',
    'call notes - why didnt move forward',
    'PCN - Why didn&#39;t the prospect move forward?', // HTML encoded
    'Call Notes - Why didn&#39;t the prospect move forward?', // HTML encoded
    'PCN - Why didn\'t the prospect move forward?',
    'Call Notes - Why didn\'t the prospect move forward?',
    'why didnt the prospect move forward',
    'why didn\'t move forward',
    'why didnt the prospect move forward?'
  ],
  nurtureType: [
    'pcn - nurture type',
    'pcn_nurture_type',
    'nurture type',
    'call notes - nurture type'
  ],
  followUpScheduled: [
    'pcn - was a follow up scheduled?',
    'pcn_was_follow_up_scheduled',
    'was a follow up scheduled',
    'follow up scheduled',
    'call notes - was a follow up scheduled?'
  ],
  followUpDate: [
    'pcn - submission date',
    'pcn submission date',
    'follow up date',
    'pcn_follow_up_date',
    'call notes - submission date',
    'call notes - follow up date'
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
    'did you make an offer',
    'call notes - did you make an offer?'
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
    'dq reason',
    'call notes - dq reason'
  ],
  qualificationStatus: [
    'pcn - qualification status',
    'pcn_qualification_status',
    'qualification status',
    'call notes - qualification status'
  ],
  firstCallOrFollowUp: [
    'pcn - first call or follow up',
    'pcn_first_call_or_follow_up',
    'first call or follow up',
    'call notes - first call or follow up'
  ],
  notMovingForwardNotes: [
    'pcn - not moving forward notes',
    'pcn_not_moving_forward_notes',
    'not moving forward notes',
    'call notes - not moving forward notes'
  ],
  objectionType: [
    'pcn - objection type',
    'pcn_objection_type',
    'objection type',
    'call notes - objection type'
  ],
  objectionNotes: [
    'pcn - objection notes',
    'pcn_objection_notes',
    'objection notes',
    'call notes - objection notes'
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

function normalizeString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function normalizeFirstCallOrFollowUp(
  value: unknown
): PCNSubmission['firstCallOrFollowUp'] | undefined {
  const text = normalizeString(value)
  if (!text) return undefined
  const lower = text.toLowerCase()
  if (lower.includes('follow')) return 'follow_up'
  if (lower.includes('first')) return 'first_call'
  return undefined
}

function normalizeNurtureType(
  value: unknown
): PCNSubmission['nurtureType'] | undefined {
  const text = normalizeString(value)
  if (!text) return undefined
  const lower = text.toLowerCase()
  if (lower.includes('redzone') || lower.includes('within 7')) return 'timing'
  if (lower.includes('timing')) return 'timing'
  if (lower.includes('budget')) return 'budget'
  if (lower.includes('think') || lower.includes('follow up')) return 'thinking_it_over'
  if (lower.includes('not qualified')) return 'not_qualified_yet'
  if (lower.includes('other')) return 'other'
  return 'other'
}

function normalizeQualificationStatus(
  value: unknown
): PCNSubmission['qualificationStatus'] | undefined {
  const text = normalizeString(value)
  if (!text) return undefined
  const lower = text.toLowerCase()
  if (lower.includes('qualified')) return 'qualified_to_purchase'
  if (lower.includes('disqual')) return 'disqualified'
  if (lower.includes('downsell')) return 'downsell_opportunity'
  return undefined
}

function normalizeNoShowCommunicative(
  value: unknown
): NoShowCommunicative | undefined {
  const text = normalizeString(value)
  if (!text) return undefined
  const lower = text.toLowerCase()
  if (lower.includes('communicative') && lower.includes('rescheduled')) {
    return 'communicative_rescheduled'
  }
  if (lower.includes('communicative') || lower.includes('yes') || lower === 'y') {
    return 'communicative_up_to_call'
  }
  if (lower.includes('not communicative') || lower.includes('no') || lower === 'n') {
    return 'not_communicative'
  }
  return undefined
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
          ghlWebhookSecret: true,
          ghlMarketplaceWebhookSecret: true
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

      // Check both old and new webhook secret fields for backward compatibility
      // Try both fields and check if either matches
      const oldSecret = company.ghlWebhookSecret
      const newSecret = company.ghlMarketplaceWebhookSecret
      const validSecret = oldSecret || newSecret
      
      // Check if the provided secret matches either stored secret
      const secretMatches = (oldSecret && oldSecret === secret) || (newSecret && newSecret === secret)
      
      if (!validSecret || !secretMatches) {
        console.error('[PCN Survey] Secret validation failed:', {
          companyId,
          companyName: company.name,
          hasGhlWebhookSecret: !!oldSecret,
          hasGhlMarketplaceWebhookSecret: !!newSecret,
          secretProvided: secret ? 'yes' : 'no',
          secretLength: secret?.length || 0,
          oldSecretMatches: oldSecret === secret,
          newSecretMatches: newSecret === secret,
          oldSecretPreview: oldSecret ? oldSecret.substring(0, 16) + '...' : 'null',
          newSecretPreview: newSecret ? newSecret.substring(0, 16) + '...' : 'null',
          providedSecretPreview: secret ? secret.substring(0, 16) + '...' : 'null'
        })
        return logFailure(403, 'Invalid secret', {
          hint: 'Webhook secret may need to be regenerated. Check GHL webhook configuration.',
          companyId,
          hasOldSecret: !!oldSecret,
          hasNewSecret: !!newSecret
        })
      }

      // Try multiple ways to extract appointment ID
      const rawAppointmentId =
        extractField<string>(flattened, FIELD_MAP.appointmentId) ||
        flattened['appointment.id'] ||
        flattened['data.appointmentId'] ||
        flattened['appointmentId'] ||
        flattened['PCN - Appointment ID'] ||
        flattened['Call Notes - Appointment ID'] ||
        payload['appointmentId'] ||
        payload['appointment.id'] ||
        payload['PCN - Appointment ID'] ||
        payload['Call Notes - Appointment ID'] ||
        (payload as any)?.appointment?.id ||
        (payload as any)?.data?.appointmentId

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
        noshowed: 'no_show',
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

      const firstCallRaw =
        extractField<string>(flattened, FIELD_MAP.firstCallOrFollowUp) ||
        payload['PCN - First Call or Follow Up'] ||
        payload['Call Notes - First Call or Follow Up']
      const normalizedFirstCall = normalizeFirstCallOrFollowUp(firstCallRaw)
      if (normalizedFirstCall) {
        submission.firstCallOrFollowUp = normalizedFirstCall
      }

      const nurtureNormalized = normalizeNurtureType(submission.nurtureType)
      submission.nurtureType = nurtureNormalized ?? undefined

      submission.whyDidntMoveForward =
        normalizeString(submission.whyDidntMoveForward) ?? undefined

      const notMovingForwardNotesRaw = extractField<string>(
        flattened,
        FIELD_MAP.notMovingForwardNotes
      )
      const normalizedNotMovingForwardNotes = normalizeString(notMovingForwardNotesRaw)
      if (normalizedNotMovingForwardNotes) {
        submission.notMovingForwardNotes = normalizedNotMovingForwardNotes
      }

      const objectionTypeRaw = extractField<string>(flattened, FIELD_MAP.objectionType)
      const normalizedObjectionType = normalizeString(objectionTypeRaw)
      if (normalizedObjectionType) {
        submission.objectionType = normalizedObjectionType
      }

      const objectionNotesRaw = extractField<string>(flattened, FIELD_MAP.objectionNotes)
      const normalizedObjectionNotes = normalizeString(objectionNotesRaw)
      if (normalizedObjectionNotes) {
        submission.objectionNotes = normalizedObjectionNotes
      }

      submission.followUpDate = normalizeString(submission.followUpDate) ?? undefined

      const qualificationNormalized = normalizeQualificationStatus(
        submission.qualificationStatus
      )
      submission.qualificationStatus = qualificationNormalized ?? undefined

      const disqualificationNormalized = normalizeString(submission.disqualificationReason)
      submission.disqualificationReason = disqualificationNormalized ?? undefined

      submission.cancellationReason = normalizeString(submission.cancellationReason)

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

      const noShowCommunicativeNormalized = normalizeNoShowCommunicative(
        extractField(flattened, FIELD_MAP.noShowCommunicative)
      )
      if (noShowCommunicativeNormalized) {
        submission.noShowCommunicative = noShowCommunicativeNormalized
      }

      if (canonicalOutcome === 'showed' && !submission.firstCallOrFollowUp) {
        submission.firstCallOrFollowUp = submission.followUpScheduled ? 'follow_up' : 'first_call'
      }

      // Apply defaults for missing required fields when not in strict mode
      // This makes the webhook handler more forgiving for GHL submissions
      if (canonicalOutcome === 'showed') {
        // Default firstCallOrFollowUp if not provided
        if (!submission.firstCallOrFollowUp) {
          submission.firstCallOrFollowUp = submission.followUpScheduled ? 'follow_up' : 'first_call'
        }
        // Default wasOfferMade to false if not provided
        if (submission.wasOfferMade === undefined || submission.wasOfferMade === null) {
          submission.wasOfferMade = false
        }
        // If offer was made but no reason provided, use a default
        if (submission.wasOfferMade && !submission.whyDidntMoveForward) {
          submission.whyDidntMoveForward = 'Not specified'
        }
        // If follow-up scheduled but no date, clear the flag
        if (submission.followUpScheduled && !submission.followUpDate) {
          submission.followUpScheduled = false
        }
        // If follow-up scheduled but no nurture type, use default
        if (submission.followUpScheduled && !submission.nurtureType) {
          submission.nurtureType = 'other'
        }
      }

      if (canonicalOutcome === 'cancelled' && !submission.cancellationReason) {
        submission.cancellationReason = 'Not specified'
      }

      // noShowCommunicative is optional, so we don't set a default

      if (canonicalOutcome === 'signed' && (!submission.cashCollected || submission.cashCollected <= 0)) {
        // Try to extract from other fields
        const cashFromOtherFields = parseCash(
          extractField(flattened, ['Payment Amount', 'Charged Amount', 'Deposit Amount', 'PaymentAmount', 'ChargedAmount', 'DepositAmount']) ||
          flattened['Payment Amount'] ||
          flattened['Charged Amount'] ||
          flattened['Deposit Amount']
        )
        if (cashFromOtherFields && cashFromOtherFields > 0) {
          submission.cashCollected = cashFromOtherFields
        } else {
          // Default to 0 if not found (webhook mode is lenient)
          submission.cashCollected = 0
        }
      }

      let result
      try {
        result = await submitPCN({
          appointmentId,
          companyId: company.id,
          submission,
          actorUserId: null,
          actorName: 'GHL Survey Automation',
          strictValidation: false // Use non-strict validation for webhook submissions
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

