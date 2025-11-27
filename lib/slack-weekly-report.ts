import { withPrisma } from './db'
import { getSlackClient } from './slack-client'
import { processQuery } from './ai-query-engine'

/**
 * Generate weekly KPI summary for a company
 */
export async function generateWeeklyReport(companyId: string): Promise<string> {
  const endDate = new Date()
  const startDate = new Date()
  startDate.setDate(startDate.getDate() - 7) // Last 7 days

  // Get key metrics
  const metrics = await withPrisma(async (prisma) => {
    const appointments = await prisma.appointment.findMany({
      where: {
        companyId,
        scheduledAt: {
          gte: startDate,
          lte: endDate
        }
      },
      include: {
        closer: {
          select: { name: true }
        }
      }
    })

    const showed = appointments.filter(a => a.status === 'showed').length
    const signed = appointments.filter(a => a.outcome === 'signed').length
    const scheduled = appointments.length
    const revenue = appointments
      .filter(a => a.outcome === 'signed')
      .reduce((sum, a) => sum + (a.cashCollected || 0) + (a.totalPrice || 0), 0)

    const showRate = scheduled > 0 ? ((showed / scheduled) * 100).toFixed(1) : '0.0'
    const closeRate = showed > 0 ? ((signed / showed) * 100).toFixed(1) : '0.0'

    // Top closer by revenue
    const closerRevenue: Record<string, number> = {}
    appointments
      .filter(a => a.outcome === 'signed' && a.closer)
      .forEach(a => {
        const closerName = a.closer!.name
        const amount = (a.cashCollected || 0) + (a.totalPrice || 0)
        closerRevenue[closerName] = (closerRevenue[closerName] || 0) + amount
      })

    const topCloser = Object.entries(closerRevenue)
      .sort(([, a], [, b]) => b - a)[0]

    return {
      scheduled,
      showed,
      signed,
      revenue,
      showRate,
      closeRate,
      topCloser: topCloser ? { name: topCloser[0], revenue: topCloser[1] } : null
    }
  })

  // Build report
  let report = `📊 *Weekly Sales Report*\n`
  report += `*Period:* ${startDate.toLocaleDateString()} - ${endDate.toLocaleDateString()}\n\n`
  report += `*Key Metrics:*\n`
  report += `• Scheduled Calls: ${metrics.scheduled}\n`
  report += `• Showed: ${metrics.showed} (${metrics.showRate}% show rate)\n`
  report += `• Closed: ${metrics.signed} (${metrics.closeRate}% close rate)\n`
  report += `• Revenue: $${metrics.revenue.toFixed(2)}\n\n`

  if (metrics.topCloser) {
    report += `*Top Closer:* ${metrics.topCloser.name} - $${metrics.topCloser.revenue.toFixed(2)}\n`
  }

  // Get insights using AI
  try {
    const insightsQuery = `Provide insights and recommendations for the last 7 days of sales data`
    const insights = await processQuery(insightsQuery, companyId)
    if (insights.answer) {
      report += `\n*Insights:*\n${insights.answer}`
    }
  } catch (error) {
    console.error('[Weekly Report] Error generating insights:', error)
  }

  return report
}

/**
 * Send weekly report to Slack for a company
 */
export async function sendWeeklyReport(companyId: string): Promise<boolean> {
  try {
    const company = await withPrisma(async (prisma) => {
      return await prisma.company.findUnique({
        where: { id: companyId },
        select: {
          slackChannelId: true,
          slackConnectedAt: true
        }
      })
    })

    if (!company?.slackConnectedAt || !company.slackChannelId) {
      console.log(`[Weekly Report] Company ${companyId} does not have Slack connected`)
      return false
    }

    const report = await generateWeeklyReport(companyId)
    const client = await getSlackClient(companyId)

    if (!client) {
      console.error(`[Weekly Report] No Slack client for company ${companyId}`)
      return false
    }

    await client.chat.postMessage({
      channel: company.slackChannelId,
      text: report,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: report
          }
        }
      ]
    })

    console.log(`[Weekly Report] Sent weekly report to company ${companyId}`)
    return true
  } catch (error: any) {
    console.error(`[Weekly Report] Error sending report for company ${companyId}:`, error)
    return false
  }
}

/**
 * Send weekly reports to all companies with Slack connected
 */
export async function sendWeeklyReportsToAllCompanies(): Promise<{ sent: number; failed: number }> {
  const companies = await withPrisma(async (prisma) => {
    return await prisma.company.findMany({
      where: {
        slackConnectedAt: { not: null },
        slackChannelId: { not: null }
      },
      select: { id: true }
    })
  })

  let sent = 0
  let failed = 0

  for (const company of companies) {
    const success = await sendWeeklyReport(company.id)
    if (success) {
      sent++
    } else {
      failed++
    }
    
    // Small delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 1000))
  }

  return { sent, failed }
}

