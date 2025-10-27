import { NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/auth'
import { getSystemStats, getWebhookHealth, getPaymentMatchingStats } from '@/lib/super-admin-helpers'
import { withPrisma } from '@/lib/db'

export async function GET() {
  try {
    await requireSuperAdmin()
    
    const [systemStats, webhookHealth, paymentStats] = await Promise.all([
      getSystemStats(),
      getWebhookHealth(),
      getPaymentMatchingStats()
    ])
    
    // Get recent activity (last 10 webhook events)
    const recentActivity = await withPrisma(async (prisma) => {
      return await prisma.webhookEvent.findMany({
        take: 10,
        orderBy: { createdAt: 'desc' },
        include: {
          Company: {
            select: { name: true }
          }
        }
      })
    })
    
    // Get error logs
    const errorLogs = await withPrisma(async (prisma) => {
      return await prisma.webhookEvent.findMany({
        where: {
          error: { not: null }
        },
        take: 20,
        orderBy: { createdAt: 'desc' },
        include: {
          Company: {
            select: { name: true }
          }
        }
      })
    })
    
    return NextResponse.json({
      ...systemStats,
      webhookHealth,
      paymentStats,
      recentActivity,
      errorLogs: errorLogs.slice(0, 10),
      errorCount: errorLogs.length
    })
  } catch (error: any) {
    console.error('Error fetching system overview:', error)
    return NextResponse.json(
      { error: error.message },
      { status: 401 }
    )
  }
}

