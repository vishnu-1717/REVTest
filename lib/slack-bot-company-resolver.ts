import { withPrisma } from './db'

/**
 * Resolve company from Slack team_id
 * Maps Slack workspace ID to company ID
 */
export async function resolveCompanyFromSlackTeam(
  teamId: string
): Promise<{ companyId: string; companyName: string; slackSigningSecret?: string | null } | null> {
  return await withPrisma(async (prisma) => {
    const company = await prisma.company.findFirst({
      where: {
        slackWorkspaceId: teamId,
        slackConnectedAt: { not: null }
      },
      select: {
        id: true,
        name: true,
        slackBotToken: true,
        slackSigningSecret: true
      }
    })

    if (!company || !company.slackBotToken) {
      return null
    }

    return {
      companyId: company.id,
      companyName: company.name,
      slackSigningSecret: company.slackSigningSecret
    }
  })
}

/**
 * Verify Slack bot token for company
 */
export async function verifySlackBotToken(
  companyId: string,
  token: string
): Promise<boolean> {
  return await withPrisma(async (prisma) => {
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { slackBotToken: true }
    })

    return company?.slackBotToken === token
  })
}

