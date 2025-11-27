import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { getEffectiveCompanyId } from '@/lib/company-context'
import { withPrisma } from '@/lib/db'

export async function GET(request: NextRequest) {
  try {
    const user = await requireAdmin()
    const companyId = await getEffectiveCompanyId(request.url)

    if (!user.superAdmin && companyId !== user.companyId) {
      return NextResponse.json(
        { error: 'You do not have permission to view this company' },
        { status: 403 }
      )
    }

    const searchParams = request.nextUrl.searchParams
    const filter = searchParams.get('filter') || 'all'
    const processorFilter = searchParams.get('processor') || 'all'
    const timeRange = searchParams.get('timeRange') || '24h'

    // Calculate time range
    const now = new Date()
    let startDate: Date
    switch (timeRange) {
      case '1h':
        startDate = new Date(now.getTime() - 60 * 60 * 1000)
        break
      case '7d':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
        break
      case '24h':
      default:
        startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000)
        break
    }

    const events = await withPrisma(async (prisma) => {
      const where: any = {
        createdAt: { gte: startDate }
      }

      // Filter by company (unless super admin viewing all)
      if (!user.superAdmin || companyId) {
        where.companyId = companyId
      }

      // Filter by processor
      if (processorFilter !== 'all') {
        where.processor = processorFilter
      }

      // Filter by status
      if (filter === 'processed') {
        where.processed = true
        where.error = null
      } else if (filter === 'failed') {
        where.error = { not: null }
      } else if (filter === 'pending') {
        where.processed = false
        where.error = null
      }

      return await prisma.webhookEvent.findMany({
        where,
        include: {
          Company: {
            select: {
              name: true
            }
          }
        },
        orderBy: {
          createdAt: 'desc'
        },
        take: 100 // Limit to most recent 100
      })
    })

    return NextResponse.json({
      events: events.map(e => ({
        id: e.id,
        processor: e.processor,
        eventType: e.eventType,
        companyId: e.companyId,
        payload: e.payload,
        processed: e.processed,
        processedAt: e.processedAt?.toISOString() || null,
        error: e.error,
        createdAt: e.createdAt.toISOString(),
        Company: e.Company
      }))
    })
  } catch (error: any) {
    console.error('[Webhooks] Error fetching webhook events:', error)
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    )
  }
}

