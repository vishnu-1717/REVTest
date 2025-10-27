import { withPrisma } from './db'

export interface CompanyStats {
  companyId: string
  companyName: string
  userCount: number
  appointmentCount: number
  revenue: number
  activeUsers: number
  createdAt: Date
  lastActivity: Date | null
}

export interface SystemStats {
  totalCompanies: number
  totalUsers: number
  totalAppointments: number
  totalRevenue: number
  activeCompanies: number
}

/**
 * Get statistics for all companies in the system
 */
export async function getAllCompanyStats(): Promise<CompanyStats[]> {
  return await withPrisma(async (prisma) => {
    const companies = await prisma.company.findMany({
      include: {
        User: {
          select: { id: true, isActive: true }
        },
        Appointment: {
          where: { status: 'signed' },
          select: { cashCollected: true, createdAt: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    })
    
    return companies.map((company) => {
      const revenue = company.Appointment.reduce(
        (sum, apt) => sum + (apt.cashCollected || 0),
        0
      )
      
      const lastActivity = company.Appointment.length > 0
        ? company.Appointment[0].createdAt
        : null
      
      return {
        companyId: company.id,
        companyName: company.name,
        userCount: company.User.length,
        appointmentCount: company.Appointment.length,
        revenue,
        activeUsers: company.User.filter(u => u.isActive).length,
        createdAt: company.createdAt,
        lastActivity
      }
    })
  })
}

/**
 * Get system-wide statistics
 */
export async function getSystemStats(): Promise<SystemStats> {
  return await withPrisma(async (prisma) => {
    const [
      totalCompanies,
      totalUsers,
      totalAppointments,
      signedAppointments
    ] = await Promise.all([
      prisma.company.count(),
      prisma.user.count(),
      prisma.appointment.count(),
      prisma.appointment.findMany({
        where: { status: 'signed' },
        select: { cashCollected: true }
      })
    ])
    
    const totalRevenue = signedAppointments.reduce(
      (sum, apt) => sum + (apt.cashCollected || 0),
      0
    )
    
    const activeCompanies = await prisma.company.count({
      where: {
        User: {
          some: {
            isActive: true
          }
        }
      }
    })
    
    return {
      totalCompanies,
      totalUsers,
      totalAppointments,
      totalRevenue,
      activeCompanies
    }
  })
}

/**
 * Get webhook health statistics
 */
export async function getWebhookHealth() {
  return await withPrisma(async (prisma) => {
    const last24Hours = new Date()
    last24Hours.setHours(last24Hours.getHours() - 24)
    
    const webhooks = await prisma.webhookEvent.findMany({
      where: {
        createdAt: { gte: last24Hours }
      }
    })
    
    const total = webhooks.length
    const processed = webhooks.filter(w => w.processed).length
    const failed = webhooks.filter(w => w.error).length
    
    return {
      total,
      processed,
      failed,
      successRate: total > 0 ? ((processed / total) * 100).toFixed(1) : '0',
      failureRate: total > 0 ? ((failed / total) * 100).toFixed(1) : '0'
    }
  })
}

/**
 * Get payment matching statistics
 */
export async function getPaymentMatchingStats() {
  return await withPrisma(async (prisma) => {
    const [totalSales, matchedSales, unmatchedPayments] = await Promise.all([
      prisma.sale.count(),
      prisma.sale.count({
        where: { appointmentId: { not: null } }
      }),
      prisma.unmatchedPayment.count()
    ])
    
    const averageConfidence = await prisma.sale.aggregate({
      where: { matchConfidence: { not: null } },
      _avg: { matchConfidence: true }
    })
    
    return {
      totalSales,
      matchedSales,
      unmatchedPayments,
      matchingRate: totalSales > 0 
        ? ((matchedSales / totalSales) * 100).toFixed(1) 
        : '0',
      averageConfidence: averageConfidence._avg.matchConfidence 
        ? (averageConfidence._avg.matchConfidence * 100).toFixed(1)
        : '0'
    }
  })
}

