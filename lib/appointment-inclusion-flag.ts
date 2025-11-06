/**
 * Appointment Inclusion Flag Calculation
 * 
 * Determines which appointments to count in metrics:
 * - 0 or null: Don't count (superseded by another)
 * - 1: First countable appointment for this contact
 * - 2+: Follow-up appointment (2nd, 3rd, etc.)
 */

import { PrismaClient } from '@prisma/client'
import { withPrisma } from './db'

/**
 * Calculate the inclusion flag for a single appointment
 * 
 * @param appointmentId - The ID of the appointment to calculate the flag for
 * @returns The inclusion flag value (0, 1, 2+, or null) or null if appointment not found
 */
export async function calculateInclusionFlag(
  appointmentId: string
): Promise<number | null> {
  return await withPrisma(async (prisma) => {
    // Get the appointment
    const appointment = await prisma.appointment.findUnique({
      where: { id: appointmentId },
      select: {
        id: true,
        contactId: true,
        scheduledAt: true,
        status: true,
        outcome: true,
        createdAt: true,
        companyId: true
      }
    })

    if (!appointment) {
      console.warn(`[InclusionFlag] Appointment ${appointmentId} not found`)
      return null
    }

    // RULE 1: Empty Data
    if (!appointment.contactId || !appointment.scheduledAt) {
      return null
    }

    // Check if appointment is cancelled
    const isCancelled = 
      appointment.outcome === 'Cancelled' || 
      appointment.outcome === 'cancelled' ||
      appointment.status === 'cancelled'

    // RULE 2: Cancelled Appointments
    if (isCancelled) {
      // Sub-rule 2A: Check for non-cancelled appointments
      const nonCancelledAppointments = await prisma.appointment.findMany({
        where: {
          contactId: appointment.contactId,
          companyId: appointment.companyId,
          id: { not: appointmentId },
          AND: [
            {
              OR: [
                { outcome: { notIn: ['Cancelled', 'cancelled'] } },
                { outcome: null }
              ]
            },
            {
              OR: [
                { status: { not: 'cancelled' } },
                { status: null }
              ]
            }
          ]
        },
        select: { id: true, scheduledAt: true }
      })

      if (nonCancelledAppointments.length > 0) {
        // Found non-cancelled appointments, don't count this cancellation
        return 0
      }

      // Sub-rule 2B: Is this the most recent cancellation?
      const allCancellations = await prisma.appointment.findMany({
        where: {
          contactId: appointment.contactId,
          companyId: appointment.companyId,
          OR: [
            { outcome: { in: ['Cancelled', 'cancelled'] } },
            { status: 'cancelled' }
          ]
        },
        select: {
          id: true,
          scheduledAt: true,
          createdAt: true
        },
        orderBy: [
          { scheduledAt: 'desc' },
          { createdAt: 'desc' }
        ]
      })

      if (allCancellations.length === 0) {
        return 0
      }

      // Check if this is the most recent cancellation
      const mostRecentCancellation = allCancellations[0]
      const isMostRecent = 
        mostRecentCancellation.id === appointment.id ||
        (mostRecentCancellation.scheduledAt.getTime() === appointment.scheduledAt.getTime() &&
         mostRecentCancellation.createdAt.getTime() === appointment.createdAt.getTime())

      if (isMostRecent) {
        return 1 // Count the most recent cancellation
      } else {
        return 0 // Older cancellation, don't count
      }
    }

    // RULE 3: No-Show Treatment
    // No-shows should ALWAYS count in the sequence, even if they later reschedule and show up.
    // A no-show means the prospect ghosted the call (didn't show up and wasn't communicative).
    // This is different from a cancellation, which is when they decline or communicate they can't make it.
    // No-shows count in the appointment sequence, so we continue to Rule 4.

    // RULE 4: Count Position (First Call vs Follow-Up)
    // Count all appointments for this contact where:
    // - scheduledAt <= current appointment's scheduledAt
    // - NOT cancelled
    
    const allAppointmentsBeforeOrEqual = await prisma.appointment.findMany({
      where: {
        contactId: appointment.contactId,
        companyId: appointment.companyId,
        scheduledAt: { lte: appointment.scheduledAt },
        AND: [
          {
            OR: [
              { outcome: { notIn: ['Cancelled', 'cancelled'] } },
              { outcome: null }
            ]
          },
          {
            OR: [
              { status: { not: 'cancelled' } },
              { status: null }
            ]
          }
        ]
      },
      select: {
        id: true,
        scheduledAt: true,
        outcome: true
      },
      orderBy: { scheduledAt: 'asc' }
    })

    // Calculate the flag: count of appointments (no-shows are counted in sequence)
    // Each appointment counts in order: 1st, 2nd, 3rd, etc.
    // No-shows are valid appointments and should be counted in the sequence
    const flagValue = allAppointmentsBeforeOrEqual.length
    
    return Math.max(1, flagValue)
  })
}

/**
 * Recalculate inclusion flags for all appointments (batch operation)
 * 
 * @param companyId - Optional company ID to filter by. If not provided, recalculates for all companies
 * @returns Promise that resolves when all flags are recalculated
 */
export async function recalculateAllInclusionFlags(
  companyId?: string
): Promise<{ total: number; updated: number; errors: number }> {
  return await withPrisma(async (prisma) => {
    const whereClause: any = {}
    if (companyId) {
      whereClause.companyId = companyId
    }

    // Get all appointments
    const appointments = await prisma.appointment.findMany({
      where: whereClause,
      select: { id: true },
      orderBy: { scheduledAt: 'asc' }
    })

    console.log(`[InclusionFlag] Recalculating flags for ${appointments.length} appointments...`)

    let updated = 0
    let errors = 0

    // Process in batches to avoid memory issues
    const batchSize = 100
    for (let i = 0; i < appointments.length; i += batchSize) {
      const batch = appointments.slice(i, i + batchSize)
      
      await Promise.all(
        batch.map(async (apt) => {
          try {
            const flag = await calculateInclusionFlag(apt.id)
            
            await prisma.appointment.update({
              where: { id: apt.id },
              data: { appointmentInclusionFlag: flag }
            })
            
            updated++
          } catch (error: any) {
            console.error(`[InclusionFlag] Error calculating flag for ${apt.id}:`, error)
            errors++
          }
        })
      )

      // Log progress
      if (i % 1000 === 0) {
        console.log(`[InclusionFlag] Processed ${i + batch.length} / ${appointments.length} appointments`)
      }
    }

    console.log(`[InclusionFlag] Recalculation complete: ${updated} updated, ${errors} errors`)

    return {
      total: appointments.length,
      updated,
      errors
    }
  })
}

/**
 * Recalculate inclusion flags for all appointments of a specific contact
 * Useful when a single appointment changes and we need to update related appointments
 * 
 * @param contactId - The contact ID to recalculate flags for
 * @param companyId - The company ID (required for security)
 */
export async function recalculateContactInclusionFlags(
  contactId: string,
  companyId: string
): Promise<void> {
  return await withPrisma(async (prisma) => {
    // Get all appointments for this contact
    const appointments = await prisma.appointment.findMany({
      where: {
        contactId,
        companyId
      },
      select: { id: true },
      orderBy: { scheduledAt: 'asc' }
    })

    console.log(`[InclusionFlag] Recalculating flags for contact ${contactId} (${appointments.length} appointments)`)

    // Recalculate flags for all appointments of this contact
    for (const apt of appointments) {
      try {
        const flag = await calculateInclusionFlag(apt.id)
        
        await prisma.appointment.update({
          where: { id: apt.id },
          data: { appointmentInclusionFlag: flag }
        })
      } catch (error: any) {
        console.error(`[InclusionFlag] Error calculating flag for ${apt.id}:`, error)
      }
    }
  })
}

