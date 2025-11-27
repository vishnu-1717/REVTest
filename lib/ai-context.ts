import { withPrisma } from './db'

/**
 * Build company-specific context from sales data for AI queries
 * Similar to how Cursor uses codebase context
 */
export async function buildCompanyContext(companyId: string): Promise<string> {
  return await withPrisma(async (prisma) => {
    // Get key metrics
    const stats = await prisma.appointment.groupBy({
      by: ['status', 'outcome'],
      where: { companyId },
      _count: true
    })

    // Get recent appointments summary
    const recentAppointments = await prisma.appointment.findMany({
      where: { companyId },
      take: 10,
      orderBy: { scheduledAt: 'desc' },
      include: {
        contact: { select: { name: true } },
        closer: { select: { name: true } }
      }
    })

    // Get top closers
    const topClosers = await prisma.appointment.groupBy({
      by: ['closerId'],
      where: {
        companyId,
        outcome: 'signed'
      },
      _count: true,
      _sum: {
        cashCollected: true,
        totalPrice: true
      }
    })

    // Build context string
    let context = `Company Sales Data Context:\n\n`
    
    context += `Appointment Status Summary:\n`
    stats.forEach(stat => {
      context += `- ${stat.status}${stat.outcome ? ` (${stat.outcome})` : ''}: ${stat._count}\n`
    })

    context += `\nRecent Appointments:\n`
    recentAppointments.forEach(apt => {
      context += `- ${apt.contact.name} with ${apt.closer?.name || 'Unknown'} on ${apt.scheduledAt.toLocaleDateString()} - ${apt.status}${apt.outcome ? ` (${apt.outcome})` : ''}\n`
    })

    if (topClosers.length > 0) {
      context += `\nTop Closers:\n`
      topClosers.slice(0, 5).forEach(closer => {
        const revenue = (closer._sum.cashCollected || 0) + (closer._sum.totalPrice || 0)
        context += `- Closer ID ${closer.closerId}: ${closer._count} deals, $${revenue.toFixed(2)} revenue\n`
      })
    }

    return context
  })
}

