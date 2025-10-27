import { withPrisma } from './db'

export interface PaymentData {
  email?: string
  name?: string
  phone?: string
  amount: number
  processor: string
  externalId: string
  appointmentId?: string // From payment link metadata
}

export interface MatchResult {
  appointmentId: string | null
  confidence: number
  method: 'appointment_id' | 'email' | 'phone' | 'name_amount' | 'none'
  matches?: any[]
}

export async function findAppointmentForPayment(
  companyId: string,
  paymentData: PaymentData
): Promise<MatchResult> {
  
  return await withPrisma(async (prisma) => {
    // Method 1: Direct appointment ID match (from payment link)
    if (paymentData.appointmentId) {
      const appointment = await prisma.appointment.findFirst({
        where: {
          id: paymentData.appointmentId,
          companyId
        }
      })
      
      if (appointment) {
        return {
          appointmentId: appointment.id,
          confidence: 1.0,
          method: 'appointment_id'
        }
      }
    }
    
    // Method 2: Email match
    if (paymentData.email) {
      const contact = await prisma.contact.findFirst({
        where: {
          email: paymentData.email,
          companyId
        }
      })
      
      if (contact) {
        // Find recent signed appointment for this contact
        const appointment = await prisma.appointment.findFirst({
          where: {
            contactId: contact.id,
            status: 'signed',
            companyId,
            // Within last 30 days
            scheduledAt: {
              gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
            }
          },
          orderBy: {
            scheduledAt: 'desc'
          }
        })
        
        if (appointment) {
          return {
            appointmentId: appointment.id,
            confidence: 0.9,
            method: 'email'
          }
        }
      }
    }
    
    // Method 3: Phone match
    if (paymentData.phone) {
      const contact = await prisma.contact.findFirst({
        where: {
          phone: paymentData.phone,
          companyId
        }
      })
      
      if (contact) {
        const appointment = await prisma.appointment.findFirst({
          where: {
            contactId: contact.id,
            status: 'signed',
            companyId,
            scheduledAt: {
              gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
            }
          },
          orderBy: {
            scheduledAt: 'desc'
          }
        })
        
        if (appointment) {
          return {
            appointmentId: appointment.id,
            confidence: 0.85,
            method: 'phone'
          }
        }
      }
    }
    
    // Method 4: Fuzzy match by name + amount
    if (paymentData.name) {
      const nameWords = paymentData.name.toLowerCase().split(' ')
      
      // Find contacts with similar names
      const contacts = await prisma.contact.findMany({
        where: {
          companyId,
          OR: nameWords.map(word => ({
            name: {
              contains: word,
              mode: 'insensitive' as const
            }
          }))
        }
      })
      
      if (contacts.length > 0) {
        // Find recent signed appointments for these contacts
        const appointments = await prisma.appointment.findMany({
          where: {
            contactId: { in: contacts.map(c => c.id) },
            status: 'signed',
            companyId,
            scheduledAt: {
              gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
            },
            // Try to match amount (within 10%)
            cashCollected: {
              gte: paymentData.amount * 0.9,
              lte: paymentData.amount * 1.1
            }
          },
          include: {
            contact: true,
            closer: true
          },
          orderBy: {
            scheduledAt: 'desc'
          }
        })
        
        if (appointments.length === 1) {
          return {
            appointmentId: appointments[0].id,
            confidence: 0.7,
            method: 'name_amount',
            matches: appointments
          }
        }
        
        if (appointments.length > 1) {
          // Multiple matches - needs manual review
          return {
            appointmentId: null,
            confidence: 0.5,
            method: 'name_amount',
            matches: appointments
          }
        }
      }
    }
    
    // No match found
    return {
      appointmentId: null,
      confidence: 0,
      method: 'none'
    }
  })
}

export function calculateCommission(
  saleAmount: number,
  commissionRate: number,
  paymentAmount?: number
): {
  totalCommission: number
  releasedCommission: number
} {
  const totalCommission = saleAmount * commissionRate
  
  // If this is a partial payment, only release proportional commission
  if (paymentAmount && paymentAmount < saleAmount) {
    const releasedCommission = totalCommission * (paymentAmount / saleAmount)
    return { totalCommission, releasedCommission }
  }
  
  // Full payment - release full commission
  return { totalCommission, releasedCommission: totalCommission }
}

