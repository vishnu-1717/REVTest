'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

interface IntegrationStatus {
  ghl: {
    connected: boolean
    method?: 'oauth' | 'api_key'
    locationId?: string
  }
  slack: {
    connected: boolean
    workspaceName?: string
  }
  zoom: {
    connected: boolean
  }
}

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

export default function IntegrationsPage() {
  const router = useRouter()
  const [status, setStatus] = useState<IntegrationStatus>({
    ghl: { connected: false },
    slack: { connected: false },
    zoom: { connected: false }
  })
  const [loading, setLoading] = useState(true)
  const [disconnecting, setDisconnecting] = useState<string | null>(null)

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        // Fetch GHL status
        const ghlRes = await fetch(withViewAs('/api/admin/integrations/ghl'))
        const ghlData = ghlRes.ok ? await ghlRes.json() : null
        
        // Fetch Slack status (check if connected)
        const slackRes = await fetch(withViewAs('/api/admin/integrations/slack/status'))
        const slackData = slackRes.ok ? await slackRes.json() : null
        
        // Fetch Zoom status (check if connected)
        const zoomRes = await fetch(withViewAs('/api/admin/integrations/zoom/status'))
        const zoomData = zoomRes.ok ? await zoomRes.json() : null

        setStatus({
          ghl: {
            connected: ghlData?.configured || false,
            method: ghlData?.oauthConnected ? 'oauth' : (ghlData?.configured ? 'api_key' : undefined),
            locationId: ghlData?.locationId
          },
          slack: {
            connected: slackData?.connected || false,
            workspaceName: slackData?.workspaceName
          },
          zoom: {
            connected: zoomData?.connected || false
          }
        })
      } catch (error) {
        console.error('Failed to fetch integration status:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchStatus()
  }, [])

  const handleDisconnect = async (integration: 'ghl' | 'slack' | 'zoom') => {
    if (!confirm(`Are you sure you want to disconnect ${integration.toUpperCase()}? This will stop syncing data.`)) {
      return
    }

    setDisconnecting(integration)
    try {
      const endpoint = `/api/admin/integrations/${integration}/disconnect`
      const res = await fetch(withViewAs(endpoint), {
        method: 'POST'
      })

      if (!res.ok) {
        const error = await res.json()
        alert(error.error || `Failed to disconnect ${integration}`)
        return
      }

      // Update status
      setStatus(prev => ({
        ...prev,
        [integration]: { connected: false }
      }))

      alert(`${integration.toUpperCase()} disconnected successfully`)
      router.refresh()
    } catch (error) {
      console.error(error)
      alert(`Failed to disconnect ${integration}`)
    } finally {
      setDisconnecting(null)
    }
  }

  if (loading) {
    return (
      <div className="container mx-auto py-10">
        <h1 className="text-3xl font-bold mb-8">Integrations</h1>
        <p className="text-gray-600">Loading...</p>
      </div>
    )
  }

  return (
    <div className="container mx-auto py-10 px-4">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold mb-2 text-slate-100">Integrations</h1>
          <p className="text-slate-400 text-sm">Connect and manage your third-party integrations</p>
        </div>
        <Link href="/admin/integrations/webhooks">
          <Button variant="outline" className="border-slate-600 text-slate-300 hover:bg-slate-700">
            View Webhook Events
          </Button>
        </Link>
      </div>
      
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {/* GoHighLevel */}
        <Card className="bg-slate-800/60 border border-slate-700/50 hover:shadow-lg hover:shadow-indigo-500/20 transition">
          <CardHeader>
            <CardTitle className="text-slate-100">GoHighLevel</CardTitle>
          </CardHeader>
          <CardContent>
            {status.ghl.connected ? (
              <div>
                <p className="text-emerald-300 font-medium mb-1">Connected</p>
                {status.ghl.method && (
                  <p className="text-xs text-slate-400 mb-2">
                    {status.ghl.method === 'oauth' ? 'OAuth' : 'API Key'}
                    {status.ghl.locationId && ` • ${status.ghl.locationId.substring(0, 8)}...`}
                  </p>
                )}
                <p className="text-slate-300 mb-3 text-sm">Calendar and appointment syncing active</p>
                <div className="flex gap-2">
                  <Link href="/admin/integrations/ghl/setup">
                    <Button variant="outline" size="sm" className="border-slate-600 text-slate-300 hover:bg-slate-700">Manage</Button>
                  </Link>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDisconnect('ghl')}
                    disabled={disconnecting === 'ghl'}
                    className="border-red-500/60 text-red-300 hover:bg-red-900/40"
                  >
                    {disconnecting === 'ghl' ? 'Disconnecting...' : 'Disconnect'}
                  </Button>
                </div>
              </div>
            ) : (
              <div>
                <p className="text-slate-300 mb-3 text-sm">Connect your GHL account for calendar and appointment syncing</p>
                <Link href="/admin/integrations/ghl/setup">
                  <Button className="bg-indigo-600 hover:bg-indigo-700">Connect</Button>
                </Link>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Slack */}
        <Card className="bg-slate-800/60 border border-slate-700/50 hover:shadow-lg hover:shadow-indigo-500/20 transition">
          <CardHeader>
            <CardTitle className="text-slate-100">Slack</CardTitle>
          </CardHeader>
          <CardContent>
            {status.slack.connected ? (
              <div>
                <p className="text-emerald-300 font-medium mb-1">Connected</p>
                {status.slack.workspaceName && (
                  <p className="text-xs text-slate-400 mb-2">{status.slack.workspaceName}</p>
                )}
                <p className="text-slate-300 mb-3 text-sm">Manage Slack PCN notifications</p>
                <div className="flex gap-2">
                  <Link href="/admin/integrations/slack/settings">
                    <Button variant="outline" size="sm" className="border-slate-600 text-slate-300 hover:bg-slate-700">Manage</Button>
                  </Link>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDisconnect('slack')}
                    disabled={disconnecting === 'slack'}
                    className="border-red-500/60 text-red-300 hover:bg-red-900/40"
                  >
                    {disconnecting === 'slack' ? 'Disconnecting...' : 'Disconnect'}
                  </Button>
                </div>
              </div>
            ) : (
              <div>
                <p className="text-slate-300 mb-3 text-sm">Connect Slack to send PCN notifications to your team</p>
                <Link href="/admin/integrations/slack/setup">
                  <Button className="bg-indigo-600 hover:bg-indigo-700">Connect</Button>
                </Link>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Zoom */}
        <Card className="bg-slate-800/60 border border-slate-700/50 hover:shadow-lg hover:shadow-indigo-500/20 transition">
          <CardHeader>
            <CardTitle className="text-slate-100">Zoom</CardTitle>
          </CardHeader>
          <CardContent>
            {status.zoom.connected ? (
              <div>
                <p className="text-emerald-300 font-medium mb-1">Connected</p>
                <p className="text-slate-300 mb-3 text-sm">Automatically track show rates and generate PCNs from call transcripts</p>
                <div className="flex gap-2">
                  <Link href="/admin/integrations/zoom/setup">
                    <Button variant="outline" size="sm" className="border-slate-600 text-slate-300 hover:bg-slate-700">Manage</Button>
                  </Link>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDisconnect('zoom')}
                    disabled={disconnecting === 'zoom'}
                    className="border-red-500/60 text-red-300 hover:bg-red-900/40"
                  >
                    {disconnecting === 'zoom' ? 'Disconnecting...' : 'Disconnect'}
                  </Button>
                </div>
              </div>
            ) : (
              <div>
                <p className="text-slate-300 mb-3 text-sm">Connect Zoom to automate show rate tracking and AI-powered PCN generation</p>
                <Link href="/admin/integrations/zoom/setup">
                  <Button className="bg-indigo-600 hover:bg-indigo-700">Connect</Button>
                </Link>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

