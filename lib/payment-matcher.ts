import { withPrisma } from './db'

// Levenshtein distance function for fuzzy string matching
function levenshteinDistance(str1: string, str2: string): number {
  const len1 = str1.length
  const len2 = str2.length
  const matrix: number[][] = []

  // Initialize matrix
  for (let i = 0; i <= len1; i++) {
    matrix[i] = [i]
  }
  for (let j = 0; j <= len2; j++) {
    matrix[0][j] = j
  }

  // Fill matrix
  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      if (str1[i - 1] === str2[j - 1]) {
        matrix[i][j] = matrix[i - 1][j - 1]
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,     // deletion
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j - 1] + 1  // substitution
        )
      }
    }
  }

  return matrix[len1][len2]
}

// Calculate similarity score (0-1) between two strings
function calculateSimilarity(str1: string, str2: string): number {
  const normalized1 = str1.toLowerCase().trim()
  const normalized2 = str2.toLowerCase().trim()
  
  if (normalized1 === normalized2) return 1.0
  
  const maxLen = Math.max(normalized1.length, normalized2.length)
  if (maxLen === 0) return 1.0
  
  const distance = levenshteinDistance(normalized1, normalized2)
  return 1 - (distance / maxLen)
}

// Multi-criteria scoring function
function calculateMultiCriteriaScore(
  paymentData: PaymentData,
  appointment: any,
  nameSimilarity: number
): { confidence: number; reasons: string[] } {
  const reasons: string[] = []
  let confidence = 0.0
  
  // Name match (0-40% of confidence)
  if (nameSimilarity >= 0.9) {
    confidence += 0.4
    reasons.push('Name matches exactly')
  } else if (nameSimilarity >= 0.7) {
    confidence += 0.3
    reasons.push(`Name similarity: ${Math.round(nameSimilarity * 100)}%`)
  } else if (nameSimilarity >= 0.5) {
    confidence += 0.2
    reasons.push(`Name similarity: ${Math.round(nameSimilarity * 100)}%`)
  } else {
    reasons.push(`Name similarity: ${Math.round(nameSimilarity * 100)}% (low)`)
  }
  
  // Email match (0-30% of confidence)
  if (paymentData.email && appointment.contact?.email) {
    const emailMatch = paymentData.email.toLowerCase().trim() === appointment.contact.email.toLowerCase().trim()
    if (emailMatch) {
      confidence += 0.3
      reasons.push('Email matches')
    } else {
      const emailSimilarity = calculateSimilarity(paymentData.email, appointment.contact.email)
      if (emailSimilarity >= 0.8) {
        confidence += 0.15
        reasons.push(`Email similarity: ${Math.round(emailSimilarity * 100)}%`)
      }
    }
  }
  
  // Amount match (0-20% of confidence)
  if (appointment.cashCollected && paymentData.amount) {
    const amountDiff = Math.abs(appointment.cashCollected - paymentData.amount)
    const amountPercentDiff = amountDiff / paymentData.amount
    
    if (amountPercentDiff <= 0.01) {
      confidence += 0.2
      reasons.push('Amount matches exactly')
    } else if (amountPercentDiff <= 0.05) {
      confidence += 0.15
      reasons.push(`Amount within 5% (${amountDiff.toLocaleString()} difference)`)
    } else if (amountPercentDiff <= 0.1) {
      confidence += 0.1
      reasons.push(`Amount within 10% (${amountDiff.toLocaleString()} difference)`)
    } else {
      reasons.push(`Amount differs by ${amountPercentDiff.toFixed(1)}%`)
    }
  }
  
  // Date proximity (0-10% of confidence)
  if (appointment.scheduledAt) {
    const appointmentDate = new Date(appointment.scheduledAt)
    const now = new Date()
    const daysDiff = Math.abs(now.getTime() - appointmentDate.getTime()) / (1000 * 60 * 60 * 24)
    
    if (daysDiff <= 7) {
      confidence += 0.1
      reasons.push('Recent appointment (within 7 days)')
    } else if (daysDiff <= 30) {
      confidence += 0.05
      reasons.push('Recent appointment (within 30 days)')
    } else {
      reasons.push(`Appointment ${Math.round(daysDiff)} days ago`)
    }
  }
  
  // Cap confidence at 0.95 (never 100% for fuzzy matches)
  confidence = Math.min(confidence, 0.95)
  
  return { confidence, reasons }
}

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
  method: 'appointment_id' | 'email' | 'phone' | 'name_amount' | 'fuzzy_multi_criteria' | 'none'
  matches?: Array<{
    appointment: any
    confidence: number
    method: string
    reason: string
    nameSimilarity?: number
  }>
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
          method: 'appointment_id',
          matches: [{
            appointment,
            confidence: 1.0,
            method: 'appointment_id',
            reason: 'Direct appointment ID match'
          }]
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
        // First try to find signed appointment
        let appointment = await prisma.appointment.findFirst({
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
        
        // If no signed appointment, try showed appointments (deal might close later)
        if (!appointment) {
          appointment = await prisma.appointment.findFirst({
            where: {
              contactId: contact.id,
              status: 'showed',
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
        }
        
        if (appointment) {
          // If appointment was showed, update status to signed
          if (appointment.status === 'showed') {
            await prisma.appointment.update({
              where: { id: appointment.id },
              data: { status: 'signed' }
            })
          }
          
          // Calculate confidence based on email match and date proximity
          const dateDiff = Math.abs(new Date(appointment.scheduledAt).getTime() - Date.now())
          const daysAgo = dateDiff / (1000 * 60 * 60 * 24)
          const recentBonus = daysAgo <= 7 ? 0.05 : daysAgo <= 30 ? 0.02 : 0
          const confidence = Math.min(0.9 + recentBonus, 0.95)
          
          return {
            appointmentId: appointment.id,
            confidence,
            method: 'email',
            matches: [{
              appointment,
              confidence,
              method: 'email',
              reason: `Email matches "${paymentData.email}"${daysAgo <= 7 ? ' (recent appointment)' : ''}`
            }]
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
          // Calculate confidence based on phone match and date proximity
          const dateDiff = Math.abs(new Date(appointment.scheduledAt).getTime() - Date.now())
          const daysAgo = dateDiff / (1000 * 60 * 60 * 24)
          const recentBonus = daysAgo <= 7 ? 0.05 : daysAgo <= 30 ? 0.02 : 0
          const confidence = Math.min(0.85 + recentBonus, 0.9)
          
          return {
            appointmentId: appointment.id,
            confidence,
            method: 'phone',
            matches: [{
              appointment,
              confidence,
              method: 'phone',
              reason: `Phone number matches${daysAgo <= 7 ? ' (recent appointment)' : ''}`
            }]
          }
        }
      }
    }
    
    // Method 4: Fuzzy match by name with Levenshtein distance + multi-criteria scoring
    if (paymentData.name) {
      const paymentName = paymentData.name // Store in const for type narrowing
      const nameWords = paymentName.toLowerCase().split(' ').filter(w => w.length > 2)
      
      // Find contacts with similar names (broader search)
      const contacts = await prisma.contact.findMany({
        where: {
          companyId,
          OR: nameWords.length > 0 ? nameWords.map(word => ({
            name: {
              contains: word,
              mode: 'insensitive' as const
            }
          })) : [{
            name: {
              contains: paymentName.substring(0, 3),
              mode: 'insensitive' as const
            }
          }]
        }
      })
      
      if (contacts.length > 0) {
        // Find recent signed appointments for these contacts (broader date range for fuzzy matching)
        const appointments = await prisma.appointment.findMany({
          where: {
            contactId: { in: contacts.map(c => c.id) },
            status: 'signed',
            companyId,
            scheduledAt: {
              gte: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000) // 60 days for fuzzy matches
            }
          },
          include: {
            contact: true,
            closer: true
          },
          orderBy: {
            scheduledAt: 'desc'
          },
          take: 50 // Get more candidates for fuzzy matching
        })
        
        if (appointments.length > 0) {
          // Calculate fuzzy name similarity and multi-criteria scores for each appointment
          const matchesWithScores = appointments.map(apt => {
            const contactName = apt.contact?.name || ''
            const nameSimilarity = calculateSimilarity(paymentName, contactName)
            
            // Only consider if name similarity is above threshold
            if (nameSimilarity < 0.4) {
              return null
            }
            
            // Calculate multi-criteria score
            const { confidence, reasons } = calculateMultiCriteriaScore(
              paymentData,
              apt,
              nameSimilarity
            )
            
            return {
              appointment: apt,
              confidence,
              method: 'fuzzy_multi_criteria',
              reason: reasons.join(', '),
              nameSimilarity
            }
          }).filter((match): match is NonNullable<typeof match> => match !== null)
          
          if (matchesWithScores.length === 0) {
            // No matches above threshold
            return {
              appointmentId: null,
              confidence: 0,
              method: 'name_amount',
              matches: []
            }
          }
          
          // Sort by confidence descending
          matchesWithScores.sort((a, b) => b.confidence - a.confidence)
          
          // If highest confidence is above 0.7 and significantly higher than second, auto-match
          if (matchesWithScores.length === 1 || 
              (matchesWithScores[0].confidence >= 0.7 && 
               matchesWithScores.length === 1 || 
               matchesWithScores[0].confidence - (matchesWithScores[1]?.confidence || 0) >= 0.15)) {
            return {
              appointmentId: matchesWithScores[0].appointment.id,
              confidence: matchesWithScores[0].confidence,
              method: 'fuzzy_multi_criteria',
              matches: [matchesWithScores[0]]
            }
          }
          
          // Multiple good matches - return top candidates for manual review
          return {
            appointmentId: null,
            confidence: matchesWithScores[0].confidence,
            method: 'fuzzy_multi_criteria',
            matches: matchesWithScores.slice(0, 10) // Top 10 candidates
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

