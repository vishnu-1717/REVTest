import { NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/auth'
import { withPrisma } from '@/lib/db'

export async function GET() {
  try {
    await requireSuperAdmin()
    
    const last24Hours = new Date()
    last24Hours.setHours(last24Hours.getHours() - 24)
    
    const [webhookStats, paymentStats, companyStatuses] = await Promise.all([
      // Webhook statistics
      withPrisma(async (prisma) => {
        const webhooks = await prisma.webhookEvent.findMany({
          where: {
            createdAt: { gte: last24Hours }
          },
          include: {
            Company: {
              select: { name: true }
            }
          }
        })
        
        const byProcessor = webhooks.reduce((acc: any, webhook) => {
          const key = webhook.processor
          if (!acc[key]) {
            acc[key] = { total: 0, processed: 0, failed: 0 }
          }
          acc[key].total++
          if (webhook.processed) acc[key].processed++
          if (webhook.error) acc[key].failed++
          return acc
        }, {})
        
        return {
          total: webhooks.length,
          processed: webhooks.filter(w => w.processed).length,
          failed: webhooks.filter(w => w.error).length,
          byProcessor,
          recentErrors: webhooks
            .filter(w => w.error)
            .slice(0, 10)
            .map(w => ({
              id: w.id,
              processor: w.processor,
              eventType: w.eventType,
              error: w.error,
              company: w.Company?.name || 'Unknown',
              createdAt: w.createdAt
            }))
        }
      }),
      
      // Payment matching statistics
      withPrisma(async (prisma) => {
        const [totalSales, matchedSales, unmatchedPayments, recentUnmatched] = await Promise.all([
          prisma.sale.count(),
          prisma.sale.count({
            where: { appointmentId: { not: null } }
          }),
          prisma.unmatchedPayment.count(),
          prisma.unmatchedPayment.findMany({
            take: 10,
            orderBy: { createdAt: 'desc' },
            include: {
              sale: {
                select: {
                  amount: true,
                  customerName: true,
                  customerEmail: true
                }
              }
            }
          })
        ])
        
        return {
          totalSales,
          matchedSales,
          unmatchedPayments,
          matchingRate: totalSales > 0 ? ((matchedSales / totalSales) * 100).toFixed(1) : '0',
          recentUnmatched: recentUnmatched.map(p => ({
            id: p.id,
            amount: p.sale?.amount || 0,
            customerName: p.sale?.customerName || 'Unknown',
            customerEmail: p.sale?.customerEmail || 'Unknown',
            createdAt: p.createdAt
          }))
        }
      }),
      
      // Company processor statuses
      withPrisma(async (prisma) => {
        const companies = await prisma.company.findMany({
          select: {
            id: true,
            name: true,
            processor: true,
            processorConnectedAt: true
          }
        })
        
        return companies.map(c => ({
          id: c.id,
          name: c.name,
          processor: c.processor,
          connected: !!c.processorConnectedAt,
          status: c.processorConnectedAt ? 'connected' : 'not_connected'
        }))
      })
    ])
    
    return NextResponse.json({
      webhookStats,
      paymentStats,
      companyStatuses
    })
  } catch (error: any) {
    console.error('Error fetching monitoring data:', error)
    return NextResponse.json(
      { error: error.message },
      { status: 401 }
    )
  }
}

