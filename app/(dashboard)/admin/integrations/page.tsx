import { requireAdmin } from '@/lib/auth'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default async function IntegrationsPage() {
  await requireAdmin()
  
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
        
        {/* Placeholder for future integrations */}
        <Card className="opacity-50">
          <CardHeader>
            <CardTitle>More Coming Soon</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-gray-600">Additional integrations will appear here</p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

