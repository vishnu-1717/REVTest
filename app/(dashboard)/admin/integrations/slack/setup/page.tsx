'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Check, XCircle } from 'lucide-react'
// Alert component - inline since it may not exist
const Alert = ({ className, children }: { className?: string; children: React.ReactNode }) => (
  <div className={className}>{children}</div>
)
const AlertDescription = ({ className, children }: { className?: string; children: React.ReactNode }) => (
  <div className={className}>{children}</div>
)

const getViewAsCompany = () => {
  if (typeof window === 'undefined') return null
  const params = new URLSearchParams(window.location.search)
  const viewAsParam = params.get('viewAs')
  if (viewAsParam) return viewAsParam
  const match = document.cookie.match(/(?:^|;)\s*view_as_company=([^;]+)/)
  const value = match ? decodeURIComponent(match[1]) : null
  if (value === 'none') return null
  return value
}

const withViewAs = (url: string) => {
  const viewAs = getViewAsCompany()
  if (!viewAs) return url
  const separator = url.includes('?') ? '&' : '?'
  return `${url}${separator}viewAs=${viewAs}`
}

export default function SlackSetupPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [loading, setLoading] = useState(false)
  const [slackStatus, setSlackStatus] = useState<{
    connected: boolean
    workspaceName: string | null
  } | null>(null)

  const success = searchParams.get('success')
  const error = searchParams.get('error')

  useEffect(() => {
    // Fetch Slack connection status
    fetch(withViewAs('/api/admin/integrations/slack/status'))
      .then((res) => res.json())
      .then((data) => {
        if (data.connected) {
          setSlackStatus({
            connected: true,
            workspaceName: data.workspaceName,
          })
        } else {
          setSlackStatus({
            connected: false,
            workspaceName: null,
          })
        }
      })
      .catch((err) => {
        console.error('Error fetching Slack status:', err)
        setSlackStatus({
          connected: false,
          workspaceName: null,
        })
      })
  }, [])

  const handleConnect = () => {
    setLoading(true)
    // Redirect to OAuth initiation
    window.location.href = withViewAs('/api/slack/auth')
  }

  const handleDisconnect = async () => {
    if (!confirm('Are you sure you want to disconnect Slack? PCN notifications will stop.')) {
      return
    }

    setLoading(true)
    try {
      const res = await fetch(withViewAs('/api/admin/integrations/slack/disconnect'), {
        method: 'POST',
      })

      if (!res.ok) {
        throw new Error('Failed to disconnect')
      }

      setSlackStatus({
        connected: false,
        workspaceName: null,
      })
      alert('Slack disconnected successfully')
    } catch (error) {
      console.error('Error disconnecting Slack:', error)
      alert('Failed to disconnect Slack')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="container mx-auto py-10 max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle>Slack Integration</CardTitle>
          <CardDescription>
            Connect your Slack workspace to send PCN notifications to closers
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {success && (
            <Alert className="bg-green-50 border-green-200">
              <AlertDescription className="text-green-800 flex items-center gap-2">
                <Check className="h-4 w-4" /> Slack workspace connected successfully!
              </AlertDescription>
            </Alert>
          )}

          {error && (
            <Alert className="bg-red-50 border-red-200">
              <AlertDescription className="text-red-800 flex items-center gap-2">
                <XCircle className="h-4 w-4" /> Error: {error === 'oauth_cancelled' ? 'OAuth was cancelled' : error === 'invalid_state' ? 'Invalid state - please try again' : error}
              </AlertDescription>
            </Alert>
          )}

          {slackStatus?.connected ? (
            <div className="space-y-4">
              <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                <p className="font-medium text-green-800 flex items-center gap-2"><Check className="h-4 w-4" /> Connected</p>
                {slackStatus.workspaceName && (
                  <p className="text-sm text-green-700 mt-1">
                    Workspace: {slackStatus.workspaceName}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Button
                  onClick={() => router.push('/admin/integrations/slack/settings')}
                  className="w-full"
                >
                  Manage User Mappings
                </Button>
                <Button
                  onClick={handleDisconnect}
                  variant="destructive"
                  className="w-full"
                  disabled={loading}
                >
                  {loading ? 'Disconnecting...' : 'Disconnect Slack'}
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
                <p className="text-gray-700">
                  Connect your Slack workspace to enable PCN notifications. When an appointment
                  becomes pending (10+ minutes after scheduled time), closers will receive a
                  notification in Slack with a direct link to fill out the PCN.
                </p>
              </div>

              <Button
                onClick={handleConnect}
                className="w-full"
                disabled={loading}
                size="lg"
              >
                {loading ? 'Connecting...' : 'Connect Slack Workspace'}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

