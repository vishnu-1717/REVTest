import OpenAI from 'openai'
import { PCNSubmission } from '@/types/pcn'

if (!process.env.OPENAI_API_KEY) {
  console.warn('[OpenAI] OPENAI_API_KEY not set. Transcript analysis will not work.')
}

const openai = process.env.OPENAI_API_KEY 
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null

export interface AppointmentData {
  id: string
  scheduledAt: Date
  contactName: string
  contactEmail: string | null
  closerName: string | null
  calendarName: string | null
}

/**
 * Analyze call transcript and generate PCN submission
 * Uses GPT-4 to analyze the transcript and extract PCN data matching the decision tree
 */
export async function analyzeCallTranscript(
  transcript: string,
  appointmentData: AppointmentData
): Promise<PCNSubmission> {
  if (!openai) {
    throw new Error('OpenAI API key not configured')
  }

  const prompt = buildAnalysisPrompt(transcript, appointmentData)

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o', // or 'gpt-4-turbo' for better performance
      messages: [
        {
          role: 'system',
          content: `You are an AI assistant that analyzes sales call transcripts and extracts structured Post-Call Notes (PCN) data. 
You must follow the PCN decision tree exactly:

1. SIGNED (Deal Closed):
   - paymentPlanOrPIF: "payment_plan" or "pif"
   - cashCollected: amount collected
   - totalPrice: total revenue (if payment plan)
   - numberOfPayments: number of payments (if payment plan)
   - signedNotes: notes about the close

2. CONTRACT SENT:
   - Just notes

3. SHOWED (Prospect attended):
   - qualificationStatus: "qualified_to_purchase" | "downsell_opportunity" | "disqualified"
   - If qualified_to_purchase:
     - wasOfferMade: boolean
     - If offer made: whyDidntMoveForward, followUpScheduled, nurtureType
     - If offer NOT made: whyNoOffer, whyNoOfferNotes
   - If downsell_opportunity: downsellOpportunity
   - If disqualified: disqualificationReason

4. NO SHOW:
   - noShowCommunicative: "communicative_up_to_call" | "communicative_rescheduled" | "not_communicative"
   - noShowCommunicativeNotes: optional notes
   - didCallAndText: optional boolean

5. CANCELLED:
   - cancellationReason: reason from decision tree
   - cancellationNotes: notes

Return ONLY valid JSON matching the PCNSubmission interface.`
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.3, // Lower temperature for more consistent results
      response_format: { type: 'json_object' }
    })

    const content = response.choices[0]?.message?.content
    if (!content) {
      throw new Error('No response from OpenAI')
    }

    // Parse JSON response
    const parsed = JSON.parse(content)
    
    // Validate and normalize the response
    return validateAndNormalizePCN(parsed)
  } catch (error: any) {
    console.error('[OpenAI] Error analyzing transcript:', error)
    throw new Error(`Failed to analyze transcript: ${error.message}`)
  }
}

/**
 * Build analysis prompt for OpenAI
 */
function buildAnalysisPrompt(transcript: string, appointmentData: AppointmentData): string {
  return `Analyze this sales call transcript and extract Post-Call Notes (PCN) data.

Appointment Details:
- Contact: ${appointmentData.contactName}${appointmentData.contactEmail ? ` (${appointmentData.contactEmail})` : ''}
- Scheduled: ${appointmentData.scheduledAt.toISOString()}
- Closer: ${appointmentData.closerName || 'Unknown'}
- Calendar: ${appointmentData.calendarName || 'Unknown'}

Call Transcript:
${transcript}

Based on the transcript, determine:
1. Call Outcome: "signed", "contract_sent", "showed", "no_show", or "cancelled"
2. Extract all relevant PCN fields based on the outcome and decision tree

Return a JSON object with the following structure (only include fields relevant to the outcome):
{
  "callOutcome": "showed",
  "firstCallOrFollowUp": "first_call" or "follow_up" (if showed),
  "qualificationStatus": "qualified_to_purchase" | "downsell_opportunity" | "disqualified" (if showed),
  "wasOfferMade": true/false (if qualified_to_purchase),
  "whyDidntMoveForward": "Cash On Hand" | "Partner Objection" | "Fear/Uncertainty" | "Other" (if offer made),
  "whyNoOffer": "Not a decision maker" | "Budget" | "Timeline" (if offer NOT made),
  "whyNoOfferNotes": "notes" (if offer NOT made),
  "downsellOpportunity": "option name" (if downsell_opportunity),
  "disqualificationReason": "Budget Constraint" | "Authority Constraint" | "Poor Fit" | "Wrong Timing" | "Other" (if disqualified),
  "followUpScheduled": true/false (if offer made),
  "nurtureType": "Red Zone" | "Short Term Nurture" | "Long Term Nurture" (if follow-up scheduled),
  "paymentPlanOrPIF": "payment_plan" | "pif" (if signed),
  "cashCollected": number (if signed),
  "totalPrice": number (if signed and payment_plan),
  "numberOfPayments": number (if signed and payment_plan),
  "signedNotes": "notes" (if signed),
  "noShowCommunicative": "communicative_up_to_call" | "communicative_rescheduled" | "not_communicative" (if no_show),
  "noShowCommunicativeNotes": "notes" (if no_show),
  "cancellationReason": "Scheduling Conflict" | "Unresponsive" | "Budget/Decision Maker" | "Product Not Good Fit" | "Other" | "Lost Interest" | "Self Cancellation" (if cancelled),
  "cancellationNotes": "notes" (if cancelled),
  "notes": "general call notes"
}

Be thorough and extract all relevant information from the transcript.`
}

/**
 * Validate and normalize PCN submission from AI
 */
function validateAndNormalizePCN(parsed: any): PCNSubmission {
  const validOutcomes = ['signed', 'contract_sent', 'showed', 'no_show', 'cancelled']
  
  if (!parsed.callOutcome || !validOutcomes.includes(parsed.callOutcome)) {
    throw new Error(`Invalid call outcome: ${parsed.callOutcome}`)
  }

  const pcn: PCNSubmission = {
    callOutcome: parsed.callOutcome
  }

  // Add fields based on outcome
  if (parsed.callOutcome === 'signed') {
    if (parsed.paymentPlanOrPIF) {
      pcn.paymentPlanOrPIF = parsed.paymentPlanOrPIF
    }
    if (parsed.cashCollected !== undefined) {
      pcn.cashCollected = Number(parsed.cashCollected)
    }
    if (parsed.totalPrice !== undefined) {
      pcn.totalPrice = Number(parsed.totalPrice)
    }
    if (parsed.numberOfPayments !== undefined) {
      pcn.numberOfPayments = Number(parsed.numberOfPayments)
    }
    if (parsed.signedNotes) {
      pcn.signedNotes = String(parsed.signedNotes)
    }
  }

  if (parsed.callOutcome === 'showed' || parsed.callOutcome === 'contract_sent') {
    if (parsed.firstCallOrFollowUp) {
      pcn.firstCallOrFollowUp = parsed.firstCallOrFollowUp
    }
    if (parsed.qualificationStatus) {
      pcn.qualificationStatus = parsed.qualificationStatus
    }
    if (parsed.wasOfferMade !== undefined) {
      pcn.wasOfferMade = Boolean(parsed.wasOfferMade)
    }
    if (parsed.whyDidntMoveForward) {
      pcn.whyDidntMoveForward = String(parsed.whyDidntMoveForward)
    }
    if (parsed.notMovingForwardNotes) {
      pcn.notMovingForwardNotes = String(parsed.notMovingForwardNotes)
    }
    if (parsed.whyNoOffer) {
      pcn.whyNoOffer = parsed.whyNoOffer
    }
    if (parsed.whyNoOfferNotes) {
      pcn.whyNoOfferNotes = String(parsed.whyNoOfferNotes)
    }
    if (parsed.downsellOpportunity) {
      pcn.downsellOpportunity = String(parsed.downsellOpportunity)
    }
    if (parsed.disqualificationReason) {
      pcn.disqualificationReason = String(parsed.disqualificationReason)
    }
    if (parsed.followUpScheduled !== undefined) {
      pcn.followUpScheduled = Boolean(parsed.followUpScheduled)
    }
    if (parsed.nurtureType) {
      pcn.nurtureType = String(parsed.nurtureType)
    }
  }

  if (parsed.callOutcome === 'no_show') {
    if (parsed.noShowCommunicative) {
      pcn.noShowCommunicative = parsed.noShowCommunicative
    }
    if (parsed.noShowCommunicativeNotes) {
      pcn.noShowCommunicativeNotes = String(parsed.noShowCommunicativeNotes)
    }
    if (parsed.didCallAndText !== undefined) {
      pcn.didCallAndText = Boolean(parsed.didCallAndText)
    }
  }

  if (parsed.callOutcome === 'cancelled') {
    if (parsed.cancellationReason) {
      pcn.cancellationReason = String(parsed.cancellationReason)
    }
    if (parsed.cancellationNotes) {
      pcn.cancellationNotes = String(parsed.cancellationNotes)
    }
  }

  // General notes
  if (parsed.notes) {
    pcn.notes = String(parsed.notes)
  }

  return pcn
}

