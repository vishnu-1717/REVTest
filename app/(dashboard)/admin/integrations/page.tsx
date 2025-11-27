import { requireAdmin } from '@/lib/auth'
import { getEffectiveCompanyId } from '@/lib/company-context'
import { withPrisma } from '@/lib/db'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { headers } from 'next/headers'

export default async function IntegrationsPage() {
  await requireAdmin()
  
  const headersList = await headers()
  const referer = headersList.get('referer') || ''
  const companyId = await getEffectiveCompanyId(referer)
  
  // Check integration connection statuses
  const company = await withPrisma(async (prisma) => {
    return await prisma.company.findUnique({
      where: { id: companyId },
      select: {
        slackConnectedAt: true,
        slackWorkspaceName: true,
        zoomConnectedAt: true,
        zoomAccountId: true,
      },
    })
  })
  
  const slackConnected = !!company?.slackConnectedAt
  const zoomConnected = !!(company?.zoomConnectedAt && company?.zoomAccountId)
  
  return (
    <div className="container mx-auto py-10">
      <h1 className="text-3xl font-bold mb-8">Integrations</h1>
      
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <Link href="/admin/integrations/ghl/setup">
          <Card className="hover:shadow-lg transition cursor-pointer">
            <CardHeader>
              <CardTitle>GoHighLevel</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-gray-600">Connect your GHL account for calendar and appointment syncing</p>
            </CardContent>
          </Card>
        </Link>
        
        <Link href={slackConnected ? "/admin/integrations/slack/settings" : "/admin/integrations/slack/setup"}>
          <Card className="hover:shadow-lg transition cursor-pointer">
            <CardHeader>
              <CardTitle>Slack</CardTitle>
            </CardHeader>
            <CardContent>
              {slackConnected ? (
                <div>
                  <p className="text-green-600 font-medium mb-1">Connected</p>
                  {company?.slackWorkspaceName && (
                    <p className="text-sm text-gray-500">{company.slackWorkspaceName}</p>
                  )}
                  <p className="text-gray-600 mt-2">Manage Slack PCN notifications</p>
                </div>
              ) : (
                <p className="text-gray-600">Connect Slack to send PCN notifications to your team</p>
              )}
            </CardContent>
          </Card>
        </Link>
        
        <Link href="/admin/integrations/zoom/setup">
          <Card className="hover:shadow-lg transition cursor-pointer">
            <CardHeader>
              <CardTitle>Zoom</CardTitle>
            </CardHeader>
            <CardContent>
              {zoomConnected ? (
                <div>
                  <p className="text-green-600 font-medium mb-1">Connected</p>
                  <p className="text-gray-600 mt-2">Automatically track show rates and generate PCNs from call transcripts</p>
                </div>
              ) : (
                <p className="text-gray-600">Connect Zoom to automate show rate tracking and AI-powered PCN generation</p>
              )}
            </CardContent>
          </Card>
        </Link>
      </div>
    </div>
  )
}

