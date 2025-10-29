'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export default function GHLSetupPage() {
  const router = useRouter()
  const [step, setStep] = useState(1)
  
  // Step 1: GHL Credentials
  const [apiKey, setApiKey] = useState('')
  const [locationId, setLocationId] = useState('')
  const [saving, setSaving] = useState(false)
  
  // Step 2: Attribution Strategy
  const [attributionStrategy, setAttributionStrategy] = useState('ghl_fields')
  const [attributionField, setAttributionField] = useState('contact.source')
  
  const handleSaveCredentials = async () => {
    setSaving(true)
    try {
      // Save API key and location ID
      const res1 = await fetch('/api/admin/integrations/ghl', {
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
      const res2 = await fetch('/api/admin/integrations/ghl/calendars', {
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
      const res = await fetch('/api/admin/integrations/ghl/attribution', {
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
  
  const webhookUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'https://yourapp.com'}/api/webhooks/ghl`
  
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
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Step 1: Connect GoHighLevel</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
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
              
              <div className="bg-blue-50 p-4 rounded-lg">
                <h3 className="font-semibold mb-2 text-blue-900">Set Up Webhook:</h3>
                <p className="text-sm text-blue-800 mb-2">
                  In GHL, go to Settings → Integrations → Webhooks and add:
                </p>
                <code className="block text-xs bg-white p-2 rounded break-all">
                  {webhookUrl}
                </code>
                <p className="text-xs text-blue-600 mt-2">
                  Select events: Appointment Created, Updated, Cancelled
                </p>
              </div>
            </CardContent>
          </Card>
          
          <Button 
            onClick={handleSaveCredentials} 
            disabled={saving || !apiKey || !locationId}
            className="w-full"
          >
            {saving ? 'Connecting...' : 'Connect & Continue →'}
          </Button>
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
