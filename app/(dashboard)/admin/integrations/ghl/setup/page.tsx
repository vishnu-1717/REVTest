'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export default function GHLSetupPage() {
  const router = useRouter()
  const [step, setStep] = useState(1)
  
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

  // Step 1: GHL Credentials
  const [apiKey, setApiKey] = useState('')
  const [locationId, setLocationId] = useState('')
  const [saving, setSaving] = useState(false)
  const [oauthConnected, setOauthConnected] = useState(false)
  const [connectionMethod, setConnectionMethod] = useState<'oauth' | 'api_key'>('oauth')
  const [loadingStatus, setLoadingStatus] = useState(true)
  
  // Step 2: Attribution Strategy
  const [attributionStrategy, setAttributionStrategy] = useState('ghl_fields')
  const [attributionField, setAttributionField] = useState('contact.source')

  // Check connection status on mount and handle OAuth callback
  useEffect(() => {
    const checkStatus = async () => {
      try {
        // Check for OAuth callback success/error
        const params = new URLSearchParams(window.location.search)
        const success = params.get('success')
        const error = params.get('error')
        
        if (success === 'true') {
          alert('✅ GHL connected successfully!')
          // Clean URL
          window.history.replaceState({}, '', window.location.pathname)
        } else if (error) {
          alert(`❌ GHL connection failed: ${decodeURIComponent(error)}`)
          // Clean URL
          window.history.replaceState({}, '', window.location.pathname)
        }

        const res = await fetch(withViewAs('/api/admin/integrations/ghl'))
        if (res.ok) {
          const data = await res.json()
          setOauthConnected(data.oauthConnected || false)
          if (data.configured && !data.oauthConnected) {
            setConnectionMethod('api_key')
          }
        }
      } catch (error) {
        console.error('Failed to check GHL status:', error)
      } finally {
        setLoadingStatus(false)
      }
    }
    checkStatus()
  }, [])

  // Handle OAuth connection
  const handleOAuthConnect = () => {
    const url = withViewAs('/api/integrations/ghl/oauth/initiate')
    window.location.href = url
  }

  // Handle OAuth disconnect
  const handleOAuthDisconnect = async () => {
    if (!confirm('Are you sure you want to disconnect GHL? This will stop syncing appointments.')) {
      return
    }
    
    setSaving(true)
    try {
      const res = await fetch(withViewAs('/api/admin/integrations/ghl/disconnect'), {
        method: 'POST'
      })
      
      if (!res.ok) {
        const error = await res.json()
        alert(error.error || 'Failed to disconnect')
        return
      }
      
      setOauthConnected(false)
      alert('GHL disconnected successfully')
    } catch (error) {
      console.error(error)
      alert('Failed to disconnect')
    } finally {
      setSaving(false)
    }
  }
  
  const handleSaveCredentials = async () => {
    setSaving(true)
    try {
      // Save API key and location ID
      const res1 = await fetch(withViewAs('/api/admin/integrations/ghl'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey, locationId })
      })
      
      if (!res1.ok) {
        const error = await res1.json()
        alert(error.error || 'Failed to save credentials')
        setSaving(false)
        return
      }
      
      // Sync calendars
      const res2 = await fetch(withViewAs('/api/admin/integrations/ghl/calendars'), {
        method: 'POST'
      })
      
      if (!res2.ok) {
        alert('Failed to sync calendars')
        setSaving(false)
        return
      }
      
      const data = await res2.json()
      console.log(`Synced ${data.count} calendars`)
      
      setStep(2)
    } catch (error) {
      console.error(error)
      alert('Failed to save')
    }
    setSaving(false)
  }
  
  const handleSaveAttribution = async () => {
    setSaving(true)
    try {
      const res = await fetch(withViewAs('/api/admin/integrations/ghl/attribution'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          attributionStrategy,
          attributionSourceField: attributionStrategy === 'ghl_fields' ? attributionField : null,
          useCalendarsForAttribution: attributionStrategy === 'calendars'
        })
      })
      
      if (!res.ok) {
        alert('Failed to save attribution settings')
        setSaving(false)
        return
      }
      
      // If using calendars for attribution, go to calendar setup
      if (attributionStrategy === 'calendars') {
        router.push('/admin/integrations/ghl/calendars/categorize')
      } else {
        // Done!
        alert('✅ GHL integration complete!')
        router.push('/dashboard')
      }
    } catch (error) {
      console.error(error)
      alert('Failed to save')
    }
    setSaving(false)
  }
  
  // Use production domain for webhook URL (prioritize env var over current domain)
  const [webhookUrl, setWebhookUrl] = useState('')
  const [isUsingVercelUrl, setIsUsingVercelUrl] = useState(false)
  
  // Set webhook URL - prioritize NEXT_PUBLIC_APP_URL (production domain) over current domain
  useEffect(() => {
    if (typeof window !== 'undefined') {
      // In Next.js, NEXT_PUBLIC_* env vars are available in client code at build time
      // They're static replacements, so we can access them directly
      const productionUrl = process.env.NEXT_PUBLIC_APP_URL || ''
      const currentOrigin = window.location.origin
      
      // Check if we're on a Vercel deployment URL
      const isVercelDomain = currentOrigin.includes('vercel.app')
      setIsUsingVercelUrl(isVercelDomain && (!productionUrl || productionUrl === 'http://localhost:3000'))
      
      // Use production URL if set and valid, otherwise use current domain
      // This ensures webhooks always use the stable production domain when configured
      const baseUrl = productionUrl && productionUrl !== 'http://localhost:3000' 
        ? productionUrl 
        : currentOrigin
      const webhook = `${baseUrl}/api/webhooks/ghl`
      setWebhookUrl(webhook)
      
      // Warn if using non-production domain
      if (!productionUrl && isVercelDomain) {
        console.warn('⚠️ Using Vercel deployment URL for webhook. Set NEXT_PUBLIC_APP_URL in Vercel to use production domain.')
      }
    } else {
      // Fallback for SSR (shouldn't happen in client component, but just in case)
      setWebhookUrl(`${process.env.NEXT_PUBLIC_APP_URL || 'https://yourapp.com'}/api/webhooks/ghl`)
    }
  }, [])
  
  return (
    <div className="container mx-auto py-10 max-w-3xl">
      <h1 className="text-3xl font-bold mb-2">GoHighLevel Setup</h1>
      <p className="text-gray-600 mb-8">Connect your GHL account to start tracking appointments</p>
      
      {/* Progress Indicator */}
      <div className="flex items-center gap-2 mb-8">
        <div className={`flex items-center justify-center w-8 h-8 rounded-full ${
          step >= 1 ? 'bg-blue-600 text-white' : 'bg-gray-200'
        }`}>
          1
        </div>
        <div className={`flex-1 h-1 ${step >= 2 ? 'bg-blue-600' : 'bg-gray-200'}`} />
        <div className={`flex items-center justify-center w-8 h-8 rounded-full ${
          step >= 2 ? 'bg-blue-600 text-white' : 'bg-gray-200'
        }`}>
          2
        </div>
      </div>
      
      {/* Step 1: GHL Credentials */}
      {step === 1 && (
        <>
          {/* OAuth Connection Status */}
          {oauthConnected && (
            <Card className="mb-6 border-green-500 bg-green-50">
              <CardHeader>
                <CardTitle className="text-green-900">✅ GHL Connected via OAuth</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-green-800 mb-4">
                  Your GHL account is connected via OAuth. Appointments will sync automatically.
                </p>
                <div className="flex gap-2">
                  <Button
                    onClick={handleOAuthDisconnect}
                    variant="outline"
                    className="border-red-500 text-red-600 hover:bg-red-50"
                  >
                    Disconnect GHL
                  </Button>
                  <Button
                    onClick={() => setStep(2)}
                    className="bg-green-600 hover:bg-green-700"
                  >
                    Continue to Attribution Setup →
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {!oauthConnected && (
            <>
              {/* Connection Method Selection */}
              <Card className="mb-6">
                <CardHeader>
                  <CardTitle>Step 1: Connect GoHighLevel</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div>
                      <h3 className="font-semibold mb-3">Choose Connection Method:</h3>
                      <div className="space-y-3">
                        <label className={`block p-4 border-2 rounded-lg cursor-pointer transition ${
                          connectionMethod === 'oauth' ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
                        }`}>
                          <input
                            type="radio"
                            name="connectionMethod"
                            value="oauth"
                            checked={connectionMethod === 'oauth'}
                            onChange={(e) => setConnectionMethod(e.target.value as 'oauth' | 'api_key')}
                            className="mr-3"
                          />
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-semibold">OAuth (Recommended)</span>
                              <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded">
                                Recommended
                              </span>
                            </div>
                            <p className="text-sm text-gray-600 mt-1">
                              One-click connection via GHL Marketplace. More secure and easier to set up.
                            </p>
                          </div>
                        </label>

                        <label className={`block p-4 border-2 rounded-lg cursor-pointer transition ${
                          connectionMethod === 'api_key' ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
                        }`}>
                          <input
                            type="radio"
                            name="connectionMethod"
                            value="api_key"
                            checked={connectionMethod === 'api_key'}
                            onChange={(e) => setConnectionMethod(e.target.value as 'oauth' | 'api_key')}
                            className="mr-3"
                          />
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-semibold">API Key (Legacy)</span>
                              <span className="text-xs bg-gray-100 text-gray-800 px-2 py-1 rounded">
                                Legacy
                              </span>
                            </div>
                            <p className="text-sm text-gray-600 mt-1">
                              Use API key for direct integration. Requires manual setup.
                            </p>
                          </div>
                        </label>
                      </div>
                    </div>

                    {/* OAuth Connection */}
                    {connectionMethod === 'oauth' && (
                      <div className="mt-6 p-4 bg-blue-50 rounded-lg">
                        <h3 className="font-semibold mb-2 text-blue-900">Connect via OAuth</h3>
                        <p className="text-sm text-blue-800 mb-4">
                          Click the button below to securely connect your GHL account. You'll be redirected to GHL to authorize the connection.
                        </p>
                        <Button
                          onClick={handleOAuthConnect}
                          className="w-full bg-blue-600 hover:bg-blue-700"
                        >
                          Connect GHL Account
                        </Button>
                        <p className="text-xs text-blue-600 mt-3">
                          💡 This will open a new window to authorize the connection. After authorization, you'll be redirected back.
                        </p>
                      </div>
                    )}

                    {/* API Key Connection */}
                    {connectionMethod === 'api_key' && (
                      <div className="mt-6 space-y-4">
                        <div>
                          <h3 className="font-semibold mb-2">Get Your API Key:</h3>
                          <ol className="list-decimal list-inside space-y-1 text-sm text-gray-600 mb-4">
                            <li>Log into your GHL account</li>
                            <li>Go to Settings → Integrations → API Keys</li>
                            <li>Create a new API key with "Read/Write" permissions</li>
                            <li>Copy the API key below</li>
                          </ol>
                          
                          <label className="block text-sm font-medium mb-2">API Key</label>
                          <Input
                            type="password"
                            value={apiKey}
                            onChange={(e) => setApiKey(e.target.value)}
                            placeholder="ghl_live_xxxxxxxxxxxxx"
                          />
                        </div>
                        
                        <div>
                          <h3 className="font-semibold mb-2">Get Your Location ID:</h3>
                          <p className="text-sm text-gray-600 mb-4">
                            Found in your GHL account URL or in Settings → Business Profile
                          </p>
                          
                          <label className="block text-sm font-medium mb-2">Location ID</label>
                          <Input
                            value={locationId}
                            onChange={(e) => setLocationId(e.target.value)}
                            placeholder="abc123def456"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </>
          )}

          {/* Environment Variable Warning */}
          {isUsingVercelUrl && !oauthConnected && (
            <Card className="mb-6 border-yellow-500 bg-yellow-50">
              <CardHeader>
                <CardTitle className="text-yellow-900">⚠️ Setup Required: Production Domain</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-yellow-800 mb-3">
                  Your webhook URL is using a Vercel deployment URL that will change with each deployment. To use your stable production domain:
                </p>
                <ol className="list-decimal list-inside space-y-2 text-sm text-yellow-800">
                  <li>Go to your Vercel Dashboard → Project Settings → Environment Variables</li>
                  <li>Add a new variable: <code className="bg-yellow-100 px-2 py-1 rounded">NEXT_PUBLIC_APP_URL</code></li>
                  <li>Set the value to: <code className="bg-yellow-100 px-2 py-1 rounded">https://www.cleansalesdata.com</code></li>
                  <li>Select all environments (Production, Preview, Development)</li>
                  <li>Redeploy your application (Vercel will auto-redeploy after adding env vars)</li>
                </ol>
                <p className="text-xs text-yellow-700 mt-3">
                  After redeployment, refresh this page and the webhook URL will automatically update to use your production domain.
                </p>
              </CardContent>
            </Card>
          )}
          
          {/* Webhook Setup Instructions (for API key method) */}
          {connectionMethod === 'api_key' && (
            <div className="bg-blue-50 p-4 rounded-lg">
                <h3 className="font-semibold mb-2 text-blue-900">Set Up Webhook Workflow (Optional but Recommended):</h3>
                <p className="text-sm text-blue-800 mb-3">
                  Create a workflow in GHL to send appointment data in real-time. This is optional - you can also sync appointments manually.
                </p>
                
                <details className="mt-3">
                  <summary className="cursor-pointer font-medium text-blue-900 hover:text-blue-700">
                    📋 Click to see step-by-step instructions
                  </summary>
                  <div className="mt-3 space-y-3 text-sm text-blue-800">
                    <div>
                      <p className="font-semibold mb-1">Step 1: Create Workflow</p>
                      <ol className="list-decimal list-inside space-y-1 ml-2">
                        <li>Go to <strong>Automation → Workflows</strong> in GHL</li>
                        <li>Click <strong>"Create Workflow"</strong> or <strong>"+"</strong> button</li>
                        <li>Name it: <strong>"Appointment Sync to [Your App Name]"</strong></li>
                      </ol>
                    </div>
                    
                    <div>
                      <p className="font-semibold mb-1">Step 2: Add Trigger</p>
                      <ol className="list-decimal list-inside space-y-1 ml-2">
                        <li>Click the <strong>"+"</strong> icon on the workflow canvas</li>
                        <li>Search for and select <strong>"Appointment"</strong> trigger</li>
                        <li>Choose events: <strong>Created</strong>, <strong>Updated</strong>, and <strong>Cancelled</strong></li>
                        <li><strong>Important:</strong> Make sure you select the <strong>Appointment</strong> trigger (not Contact trigger), so appointment merge fields are available</li>
                      </ol>
                      <p className="text-xs text-red-600 mt-2 bg-red-50 p-2 rounded">
                        ⚠️ <strong>Common Mistake:</strong> If you use a Contact trigger, appointment merge fields won't work. 
                        You must use an <strong>Appointment trigger</strong> to access appointment data.
                      </p>
                    </div>
                    
                    <div>
                      <p className="font-semibold mb-1">Step 3: Add Custom Webhook Action</p>
                      <ol className="list-decimal list-inside space-y-1 ml-2">
                        <li>After the trigger, click <strong>"+"</strong> again</li>
                        <li>Search for <strong>"Webhook"</strong> and select <strong>"Custom Webhook"</strong></li>
                        <li>Configure the webhook:</li>
                      </ol>
                      <div className="ml-6 mt-2 space-y-2">
                        <div>
                          <strong>Method:</strong> <code className="bg-white px-1 rounded">POST</code>
                        </div>
                        <div>
                          <strong>URL:</strong> 
                          <code className="block bg-white p-2 rounded mt-1 break-all text-xs">
                            {webhookUrl || 'Loading...'}
                          </code>
                          <div className="mt-1 space-y-1">
                            <p className="text-xs text-blue-600">
                              💡 <strong>Important:</strong> This URL should use your production domain (<code className="bg-blue-50 px-1 rounded">www.cleansalesdata.com</code>), not a Vercel deployment URL.
                            </p>
                            {isUsingVercelUrl && (
                              <div className="bg-yellow-50 border border-yellow-200 rounded p-2 text-xs text-yellow-800">
                                ⚠️ <strong>Warning:</strong> This webhook URL is using a Vercel deployment URL that will change with each deployment.
                                <br />
                                <strong>Fix:</strong> Set <code className="bg-white px-1 rounded">NEXT_PUBLIC_APP_URL=https://www.cleansalesdata.com</code> in your Vercel environment variables and redeploy.
                              </div>
                            )}
                            {!isUsingVercelUrl && webhookUrl && (webhookUrl.includes('cleansalesdata.com') || !webhookUrl.includes('vercel.app')) && (
                              <div className="bg-green-50 border border-green-200 rounded p-2 text-xs text-green-800">
                                ✅ Using production domain: <code>{webhookUrl}</code>
                              </div>
                            )}
                          </div>
                        </div>
                        <div>
                          <strong>Headers:</strong> 
                          <div className="bg-white p-2 rounded mt-1 text-xs">
                            <p className="mb-1 text-gray-600">⚠️ <strong>IMPORTANT:</strong> Only put HTTP headers here (like Content-Type). <strong>Do NOT</strong> put appointment data in Headers!</p>
                            <code className="block mt-2">
                              Content-Type: application/json
                            </code>
                            <p className="mt-2 text-gray-600">You can add this header, but it's usually optional as GHL sends JSON by default.</p>
                          </div>
                        </div>
                      </div>
                    </div>
                    
                    <div>
                      <p className="font-semibold mb-1">Step 4: Configure Payload (Body)</p>
                      <p className="mb-2">
                        <strong>⚠️ CRITICAL:</strong> In the <strong>"Payload"</strong> or <strong>"Request Body"</strong> section (NOT Headers!), paste this JSON structure.
                        <br />
                        <strong>All appointment data goes in the Payload section, not Headers!</strong>
                      </p>
                      <p className="mb-2 text-sm text-gray-600">
                        Look for a section labeled "Payload", "Body", "Request Body", or "Custom Data" in your GHL webhook configuration.
                      </p>
                      <div className="bg-white p-3 rounded text-xs overflow-x-auto border-2 border-blue-200">
                        <div className="flex justify-between items-center mb-2">
                          <span className="text-gray-600">Click to copy payload template:</span>
                          <button
                            onClick={() => {
                              const payload = JSON.stringify({
                                type: "Appointment",
                                id: "{{appointment.id}}",
                                locationId: locationId || "YOUR_LOCATION_ID",
                                appointmentId: "{{appointment.id}}",
                                contactId: "{{contact.id}}",
                                calendarId: "{{appointment.calendar_id}}",
                                assignedUserId: "{{appointment.assigned_user_id}}",
                                appointmentStatus: "{{appointment.status}}",
                                startTime: "{{appointment.start_time}}",
                                endTime: "{{appointment.end_time}}",
                                title: "{{appointment.title}}",
                                notes: "{{appointment.notes}}"
                              }, null, 2).replace('YOUR_LOCATION_ID', locationId || 'YOUR_LOCATION_ID');
                              navigator.clipboard.writeText(payload);
                              alert('Payload copied to clipboard!');
                            }}
                            className="text-xs px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
                          >
                            📋 Copy
                          </button>
                        </div>
                        <pre className="text-xs">
{`{
  "type": "Appointment",
  "id": "{{appointment.id}}",
  "locationId": "${locationId || 'YOUR_LOCATION_ID'}",
  "appointmentId": "{{appointment.id}}",
  "contactId": "{{contact.id}}",
  "calendarId": "{{appointment.calendar_id}}",
  "assignedUserId": "{{appointment.assigned_user_id}}",
  "appointmentStatus": "{{appointment.status}}",
  "startTime": "{{appointment.start_time}}",
  "endTime": "{{appointment.end_time}}",
  "title": "{{appointment.title}}",
  "notes": "{{appointment.notes}}"
}`}
                        </pre>
                      </div>
                      <div className="mt-2 space-y-1 text-xs">
                        <p className="text-blue-700">
                          ⚠️ <strong>Note:</strong> GHL merge field names may vary. If the fields above don't work, check available merge fields in your workflow builder and adjust accordingly.
                        </p>
                        <p className="text-blue-600">
                          💡 <strong>Tip:</strong> If Location ID is not filled in above, manually replace <code>YOUR_LOCATION_ID</code> with your actual Location ID in the payload.
                        </p>
                      </div>
                    </div>
                    
                    <div>
                      <p className="font-semibold mb-1">Step 5: Activate Workflow</p>
                      <ol className="list-decimal list-inside space-y-1 ml-2">
                        <li>Click <strong>"Save"</strong> to save your workflow</li>
                        <li>Toggle the workflow to <strong>"Active"</strong> (top right switch)</li>
                      </ol>
                    </div>
                  </div>
                </details>
                
                <p className="text-xs text-blue-600 mt-3">
                  💡 <strong>Note:</strong> You can complete the API setup below without configuring the webhook. 
                  Webhooks enable real-time sync, but you can also manually sync appointments later.
                </p>
                
                <details className="mt-3">
                  <summary className="cursor-pointer text-xs font-medium text-blue-900 hover:text-blue-700">
                    ❓ Troubleshooting Webhook Errors
                  </summary>
                  <div className="mt-2 space-y-2 text-xs text-blue-800 bg-blue-100 p-3 rounded">
                    <div>
                      <p className="font-semibold">404 Error: "The deployment could not be found on Vercel"</p>
                      <ul className="list-disc list-inside ml-2 space-y-1 mt-1">
                        <li>You're using a preview deployment URL that expired</li>
                        <li><strong>Solution:</strong> Use your production domain URL instead</li>
                        <li>Check Vercel dashboard for your production URL</li>
                        <li>Update the webhook URL in your GHL workflow</li>
                      </ul>
                    </div>
                    <div>
                      <p className="font-semibold">500 Error or Timeout</p>
                      <ul className="list-disc list-inside ml-2 space-y-1 mt-1">
                        <li>Check that your Vercel deployment is active and healthy</li>
                        <li>Verify database connection in Vercel environment variables</li>
                        <li>Check Vercel function logs for detailed error messages</li>
                      </ul>
                    </div>
                    <div>
                      <p className="font-semibold">Webhook not receiving events</p>
                      <ul className="list-disc list-inside ml-2 space-y-1 mt-1">
                        <li>Verify workflow is active in GHL</li>
                        <li>Check that trigger events match (Created, Updated, Cancelled)</li>
                        <li>Test the webhook URL manually with a tool like Postman</li>
                      </ul>
                    </div>
                  </div>
                </details>
            </div>
          )}
          
          {!oauthConnected && connectionMethod === 'api_key' && (
            <Button 
              onClick={handleSaveCredentials} 
              disabled={saving || !apiKey || !locationId}
              className="w-full"
            >
              {saving ? 'Connecting...' : 'Connect & Continue →'}
            </Button>
          )}
        </>
      )}
      
      {/* Step 2: Attribution Strategy */}
      {step === 2 && (
        <>
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Step 2: How Do You Track Attribution?</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-600 mb-6">
                Where do you store traffic source information? (e.g. "Meta Ad", "Google", "Organic")
              </p>
              
              <div className="space-y-3">
                {/* Option 1: GHL Custom Fields */}
                <label className={`block p-4 border-2 rounded-lg cursor-pointer transition ${
                  attributionStrategy === 'ghl_fields' ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
                }`}>
                  <input
                    type="radio"
                    name="attribution"
                    value="ghl_fields"
                    checked={attributionStrategy === 'ghl_fields'}
                    onChange={(e) => setAttributionStrategy(e.target.value)}
                    className="mr-3"
                  />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">GHL Custom Fields</span>
                      <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded">
                        Recommended
                      </span>
                    </div>
                    <p className="text-sm text-gray-600 mt-1">
                      We store it in a contact field like "Lead Source" or "Traffic Source"
                    </p>
                  </div>
                </label>
                
                {attributionStrategy === 'ghl_fields' && (
                  <div className="ml-8 p-4 bg-gray-50 rounded-lg">
                    <label className="block text-sm font-medium mb-2">
                      Which field contains your traffic source?
                    </label>
                    <select
                      className="w-full border rounded-md p-2"
                      value={attributionField}
                      onChange={(e) => setAttributionField(e.target.value)}
                    >
                      <option value="contact.source">Contact Source (GHL default)</option>
                      <option value="lead_source">Lead Source</option>
                      <option value="traffic_source">Traffic Source</option>
                      <option value="utm_source">UTM Source</option>
                    </select>
                    <p className="text-xs text-gray-500 mt-2">
                      We'll pull attribution from this field for all appointments
                    </p>
                  </div>
                )}
                
                {/* Option 2: Calendar Names */}
                <label className={`block p-4 border-2 rounded-lg cursor-pointer transition ${
                  attributionStrategy === 'calendars' ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
                }`}>
                  <input
                    type="radio"
                    name="attribution"
                    value="calendars"
                    checked={attributionStrategy === 'calendars'}
                    onChange={(e) => setAttributionStrategy(e.target.value)}
                    className="mr-3"
                  />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">Calendar Names</span>
                      <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                        Advanced
                      </span>
                    </div>
                    <p className="text-sm text-gray-600 mt-1">
                      We encode traffic source in calendar names: "Sales Call (META)", "Application (GOOGLE)"
                    </p>
                  </div>
                </label>
                
                {/* Option 3: Tags */}
                <label className={`block p-4 border-2 rounded-lg cursor-pointer transition ${
                  attributionStrategy === 'tags' ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
                }`}>
                  <input
                    type="radio"
                    name="attribution"
                    value="tags"
                    checked={attributionStrategy === 'tags'}
                    onChange={(e) => setAttributionStrategy(e.target.value)}
                    className="mr-3"
                  />
                  <div>
                    <span className="font-semibold">GHL Tags</span>
                    <p className="text-sm text-gray-600 mt-1">
                      We tag contacts with traffic source (e.g. "Meta", "Google")
                    </p>
                  </div>
                </label>
                
                {/* Option 4: Don't Track */}
                <label className={`block p-4 border-2 rounded-lg cursor-pointer transition ${
                  attributionStrategy === 'none' ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
                }`}>
                  <input
                    type="radio"
                    name="attribution"
                    value="none"
                    checked={attributionStrategy === 'none'}
                    onChange={(e) => setAttributionStrategy(e.target.value)}
                    className="mr-3"
                  />
                  <div>
                    <span className="font-semibold">We Don't Track Attribution</span>
                    <p className="text-sm text-gray-600 mt-1">
                      We focus on overall performance, not traffic sources
                    </p>
                  </div>
                </label>
              </div>
            </CardContent>
          </Card>
          
          <Button 
            onClick={handleSaveAttribution} 
            disabled={saving}
            className="w-full"
          >
            {saving ? 'Saving...' : 
             attributionStrategy === 'calendars' ? 'Continue to Calendar Setup →' : 
             'Complete Setup ✓'}
          </Button>
        </>
      )}
    </div>
  )
}
