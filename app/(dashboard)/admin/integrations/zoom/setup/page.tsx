'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'

export default function ZoomSetupPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  
  const [accountId, setAccountId] = useState('')
  const [clientId, setClientId] = useState('')
  const [clientSecret, setClientSecret] = useState('')
  const [autoSubmitPCN, setAutoSubmitPCN] = useState(false)
  const [connected, setConnected] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)

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

  // Load current status
  useEffect(() => {
    const loadStatus = async () => {
      try {
        const res = await fetch(withViewAs('/api/admin/integrations/zoom'))
        if (res.ok) {
          const data = await res.json()
          setConnected(data.configured || false)
          if (data.configured) {
            setAccountId(data.accountId || '')
            setClientId(data.clientId || '')
            setAutoSubmitPCN(data.autoSubmitPCN || false)
          }
        }
      } catch (error) {
        console.error('Failed to load Zoom status:', error)
      } finally {
        setLoading(false)
      }
    }
    loadStatus()
  }, [])

  const handleTestConnection = async () => {
    setTesting(true)
    setTestResult(null)
    
    try {
      const res = await fetch(withViewAs('/api/admin/integrations/zoom/test'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId, clientId, clientSecret })
      })
      
      const data = await res.json()
      setTestResult({
        success: data.success || false,
        message: data.message || data.error || 'Connection test completed'
      })
    } catch (error: any) {
      setTestResult({
        success: false,
        message: error.message || 'Failed to test connection'
      })
    } finally {
      setTesting(false)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const res = await fetch(withViewAs('/api/admin/integrations/zoom'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId,
          clientId,
          clientSecret,
          autoSubmitPCN
        })
      })
      
      if (!res.ok) {
        const error = await res.json()
        alert(error.error || 'Failed to save Zoom credentials')
        return
      }
      
      setConnected(true)
      alert('✅ Zoom integration saved successfully!')
    } catch (error) {
      console.error(error)
      alert('Failed to save')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="container mx-auto py-10">Loading...</div>
  }

  return (
    <div className="container mx-auto py-10 max-w-3xl">
      <h1 className="text-3xl font-bold mb-2">Zoom Integration Setup</h1>
      <p className="text-gray-600 mb-8">Connect Zoom to automate show rate and PCN generation from call transcripts</p>

      {connected && (
        <Card className="mb-6 border-green-500 bg-green-50">
          <CardHeader>
            <CardTitle className="text-green-900">✅ Zoom Connected</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-green-800 mb-4">
              Zoom is connected. Appointments will automatically update show rate and generate PCNs from transcripts.
            </p>
            <Button
              onClick={() => setConnected(false)}
              variant="outline"
              className="border-red-500 text-red-600 hover:bg-red-50"
            >
              Edit Settings
            </Button>
          </CardContent>
        </Card>
      )}

      {(!connected || accountId) && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Zoom Credentials</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label className="text-sm font-medium mb-2 block">
                Account ID <span className="text-red-500">*</span>
              </Label>
              <Input
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                placeholder="Your Zoom Account ID"
                disabled={connected}
              />
              <p className="text-xs text-gray-500 mt-1">
                Found in your Zoom app credentials (Server-to-Server OAuth)
              </p>
            </div>

            <div>
              <Label className="text-sm font-medium mb-2 block">
                Client ID <span className="text-red-500">*</span>
              </Label>
              <Input
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                placeholder="Your Zoom Client ID"
                disabled={connected}
              />
            </div>

            <div>
              <Label className="text-sm font-medium mb-2 block">
                Client Secret <span className="text-red-500">*</span>
              </Label>
              <Input
                type="password"
                value={clientSecret}
                onChange={(e) => setClientSecret(e.target.value)}
                placeholder="Your Zoom Client Secret"
                disabled={connected}
              />
            </div>

            {!connected && (
              <div className="flex gap-2">
                <Button
                  onClick={handleTestConnection}
                  disabled={testing || !accountId || !clientId || !clientSecret}
                  variant="outline"
                >
                  {testing ? 'Testing...' : 'Test Connection'}
                </Button>
                <Button
                  onClick={handleSave}
                  disabled={saving || !accountId || !clientId || !clientSecret}
                  className="flex-1"
                >
                  {saving ? 'Saving...' : 'Save & Connect'}
                </Button>
              </div>
            )}

            {testResult && (
              <div className={`p-3 rounded-lg ${
                testResult.success ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'
              }`}>
                {testResult.success ? '✅' : '❌'} {testResult.message}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>PCN Auto-Submission</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm font-medium">Automatically submit AI-generated PCNs</Label>
              <p className="text-xs text-gray-500 mt-1">
                When enabled, PCNs generated from Zoom transcripts will be automatically submitted.
                When disabled, they will be sent to Slack for review first.
              </p>
            </div>
            <Switch
              checked={autoSubmitPCN}
              onCheckedChange={setAutoSubmitPCN}
              disabled={saving}
            />
          </div>
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Webhook Configuration</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div>
              <Label className="text-sm font-medium mb-2 block">Webhook URL</Label>
              <div className="flex gap-2">
                <Input
                  value={`${typeof window !== 'undefined' ? window.location.origin : ''}/api/webhooks/zoom`}
                  readOnly
                  className="font-mono text-sm"
                />
                <Button
                  variant="outline"
                  onClick={() => {
                    const url = `${typeof window !== 'undefined' ? window.location.origin : ''}/api/webhooks/zoom`
                    navigator.clipboard.writeText(url)
                    alert('Webhook URL copied to clipboard!')
                  }}
                >
                  Copy
                </Button>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Configure this URL in your Zoom app webhook settings. Enable "recording.completed" event.
              </p>
            </div>

            <div>
              <Label className="text-sm font-medium mb-2 block">Webhook Secret (Optional)</Label>
              <Input
                type="password"
                placeholder="Enter webhook secret for signature verification"
                className="font-mono text-sm"
              />
              <p className="text-xs text-gray-500 mt-1">
                If you set a webhook secret in Zoom, add it to your environment variables as ZOOM_WEBHOOK_SECRET
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="bg-blue-50 p-4 rounded-lg">
        <h3 className="font-semibold mb-2 text-blue-900">How It Works</h3>
        <ol className="list-decimal list-inside space-y-2 text-sm text-blue-800">
          <li>When a Zoom recording completes, Zoom sends a webhook to your endpoint</li>
          <li>We automatically update the appointment show rate based on meeting duration and participants</li>
          <li>If a transcript is available, we analyze it with AI to generate PCN data</li>
          <li>PCN is either auto-submitted (if enabled) or sent to Slack for review</li>
        </ol>
      </div>
    </div>
  )
}

