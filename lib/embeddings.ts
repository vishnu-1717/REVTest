import OpenAI from 'openai'
import { withPrisma } from './db'
import { Prisma } from '@prisma/client'

if (!process.env.OPENAI_API_KEY) {
  console.warn('[Embeddings] OPENAI_API_KEY not set. Embeddings will not work.')
}

const openai = process.env.OPENAI_API_KEY 
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null

/**
 * Build semantic text from appointment data for embedding
 */
export function buildSemanticText(appointment: any): string {
  const parts: string[] = []

  if (appointment.contact?.name) {
    parts.push(`Contact: ${appointment.contact.name}`)
  }
  if (appointment.closer?.name) {
    parts.push(`Closer: ${appointment.closer.name}`)
  }
  if (appointment.status) {
    parts.push(`Status: ${appointment.status}`)
  }
  if (appointment.outcome) {
    parts.push(`Outcome: ${appointment.outcome}`)
  }
  if (appointment.qualificationStatus) {
    parts.push(`Qualification: ${appointment.qualificationStatus}`)
  }
  if (appointment.objectionType) {
    parts.push(`Objection: ${appointment.objectionType}`)
  }
  if (appointment.objectionNotes) {
    parts.push(`Objection Notes: ${appointment.objectionNotes}`)
  }
  if (appointment.notes) {
    parts.push(`Notes: ${appointment.notes}`)
  }
  if (appointment.signedNotes) {
    parts.push(`Signed Notes: ${appointment.signedNotes}`)
  }
  if (appointment.notMovingForwardNotes) {
    parts.push(`Not Moving Forward: ${appointment.notMovingForwardNotes}`)
  }
  if (appointment.cancellationNotes) {
    parts.push(`Cancellation: ${appointment.cancellationNotes}`)
  }
  if (appointment.noShowCommunicativeNotes) {
    parts.push(`No Show Notes: ${appointment.noShowCommunicativeNotes}`)
  }
  if (appointment.whyNoOfferNotes) {
    parts.push(`Why No Offer: ${appointment.whyNoOfferNotes}`)
  }
  if (appointment.whyDidntMoveForward) {
    parts.push(`Why Didn't Move Forward: ${appointment.whyDidntMoveForward}`)
  }
  if (appointment.disqualificationReason) {
    parts.push(`Disqualified: ${appointment.disqualificationReason}`)
  }
  if (appointment.downsellOpportunity) {
    parts.push(`Downsell: ${appointment.downsellOpportunity}`)
  }
  if (appointment.cancellationReason) {
    parts.push(`Cancellation Reason: ${appointment.cancellationReason}`)
  }
  if (appointment.trafficSource?.name) {
    parts.push(`Source: ${appointment.trafficSource.name}`)
  }
  if (appointment.calendarRelation?.name) {
    parts.push(`Calendar: ${appointment.calendarRelation.name}`)
  }
  if (appointment.zoomTranscript) {
    // Include transcript excerpt (first 500 chars)
    parts.push(`Transcript: ${appointment.zoomTranscript.substring(0, 500)}`)
  }

  return parts.join('. ')
}

/**
 * Generate embedding for appointment
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  if (!openai) {
    throw new Error('OpenAI API key not configured')
  }

  if (!text || text.trim().length === 0) {
    throw new Error('Text is required for embedding generation')
  }

  try {
    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: text
    })

    return response.data[0].embedding
  } catch (error: any) {
    console.error('[Embeddings] Error generating embedding:', error)
    throw new Error(`Failed to generate embedding: ${error.message}`)
  }
}

/**
 * Store embedding in CallAnalyticsEmbedding table
 */
export async function storeEmbedding(
  appointmentId: string,
  companyId: string,
  semanticText: string,
  embedding: number[]
): Promise<void> {
  await withPrisma(async (prisma) => {
    // Use raw SQL since CallAnalyticsEmbedding is not in Prisma schema
    const embeddingArray = `[${embedding.join(',')}]`
    
    await prisma.$executeRawUnsafe(`
      INSERT INTO "CallAnalyticsEmbedding" ("appointmentId", "companyId", "semantic_text", embedding)
      VALUES ($1, $2, $3, $4::vector)
      ON CONFLICT ("appointmentId") 
      DO UPDATE SET 
        "semantic_text" = EXCLUDED."semantic_text",
        embedding = EXCLUDED.embedding,
        "companyId" = EXCLUDED."companyId"
    `, appointmentId, companyId, semanticText, embeddingArray)
  })
}

/**
 * Generate and store embedding for an appointment
 */
export async function generateAndStoreEmbedding(
  appointmentId: string,
  companyId: string
): Promise<void> {
  // Get appointment with all related data
  const appointment = await withPrisma(async (prisma) => {
    return await prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: {
        contact: true,
        closer: true,
        trafficSource: true,
        calendarRelation: true
      }
    })
  })

  if (!appointment) {
    throw new Error(`Appointment ${appointmentId} not found`)
  }

  if (appointment.companyId !== companyId) {
    throw new Error('Appointment does not belong to company')
  }

  // Build semantic text
  const semanticText = buildSemanticText(appointment)

  if (!semanticText || semanticText.trim().length === 0) {
    console.warn(`[Embeddings] No semantic text generated for appointment ${appointmentId}`)
    return
  }

  // Generate embedding
  const embedding = await generateEmbedding(semanticText)

  // Store embedding
  await storeEmbedding(appointmentId, companyId, semanticText, embedding)

  console.log(`[Embeddings] Stored embedding for appointment ${appointmentId}`)
}

/**
 * Backfill embeddings for all appointments in a company
 */
export async function backfillEmbeddings(
  companyId: string,
  batchSize: number = 10
): Promise<{ processed: number; errors: number }> {
  let processed = 0
  let errors = 0

  let hasMore = true
  let offset = 0

  while (hasMore) {
    const appointments = await withPrisma(async (prisma) => {
      return await prisma.appointment.findMany({
        where: { companyId },
        include: {
          contact: true,
          closer: true,
          trafficSource: true,
          calendarRelation: true
        },
        skip: offset,
        take: batchSize,
        orderBy: { createdAt: 'desc' }
      })
    })

    if (appointments.length === 0) {
      hasMore = false
      break
    }

    // Process batch
    for (const appointment of appointments) {
      try {
        await generateAndStoreEmbedding(appointment.id, companyId)
        processed++
      } catch (error: any) {
        console.error(`[Embeddings] Error processing appointment ${appointment.id}:`, error)
        errors++
      }
    }

    offset += batchSize
    hasMore = appointments.length === batchSize

    // Small delay to avoid rate limiting
    if (hasMore) {
      await new Promise(resolve => setTimeout(resolve, 1000))
    }
  }

  return { processed, errors }
}

/**
 * Update embedding when appointment is updated
 */
export async function updateEmbeddingOnAppointmentChange(
  appointmentId: string
): Promise<void> {
  const appointment = await withPrisma(async (prisma) => {
    return await prisma.appointment.findUnique({
      where: { id: appointmentId },
      select: { companyId: true }
    })
  })

  if (!appointment) {
    return
  }

  try {
    await generateAndStoreEmbedding(appointmentId, appointment.companyId)
  } catch (error: any) {
    console.error(`[Embeddings] Error updating embedding for appointment ${appointmentId}:`, error)
  }
}

