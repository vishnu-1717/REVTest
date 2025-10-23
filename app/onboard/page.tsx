'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default function OnboardPage() {
  const [companyName, setCompanyName] = useState('')
  const [email, setEmail] = useState('')
  const [processor, setProcessor] = useState('whop')
  const [webhookUrl, setWebhookUrl] = useState('')
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    try {
      // Create company in database
      const res = await fetch('/api/onboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyName,
          email,
          processor,
        })
      })
      
      const data = await res.json()
      
      if (!res.ok) {
        throw new Error(data.error || 'Failed to create company')
      }
      
      // Show them their unique webhook URL
      setWebhookUrl(data.webhookUrl)
    } catch (error) {
      console.error('Onboard error:', error)
      alert(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }
  
  return (
    <div className="container mx-auto py-10 max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle>Connect Your Payment Processor</CardTitle>
        </CardHeader>
        <CardContent>
          {!webhookUrl ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">
                  Company Name
                </label>
                <Input
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  required
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-2">
                  Email
                </label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-2">
                  Payment Processor
                </label>
                <select
                  value={processor}
                  onChange={(e) => setProcessor(e.target.value)}
                  className="w-full border rounded-md p-2"
                >
                  <option value="whop">Whop</option>
                  <option value="stripe">Stripe</option>
                  <option value="nmi">NMI</option>
                </select>
              </div>
              
              <Button type="submit" className="w-full">
                Generate Webhook URL
              </Button>
            </form>
          ) : (
            <div className="space-y-4">
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <h3 className="font-semibold text-green-900 mb-2">
                  ✓ Company Created!
                </h3>
                <p className="text-sm text-green-700">
                  Add this webhook URL to your {processor} account:
                </p>
              </div>
              
              <div className="bg-gray-100 p-4 rounded-lg font-mono text-sm break-all">
                {webhookUrl}
              </div>
              
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h4 className="font-semibold text-blue-900 mb-2">
                  Next Steps:
                </h4>
                <ol className="text-sm text-blue-700 space-y-2 list-decimal list-inside">
                  <li>Copy the webhook URL above</li>
                  <li>Go to your {processor} dashboard</li>
                  <li>Add this URL as a webhook endpoint</li>
                  <li>Test by making a sale</li>
                  <li>Check your dashboard to see it appear!</li>
                </ol>
              </div>
              
                <div className="flex gap-2">
                  <Button onClick={() => window.location.href = '/dashboard'} className="flex-1">
                    Go to Dashboard
                  </Button>
                  <Button 
                    onClick={() => {
                      setWebhookUrl('')
                      setCompanyName('')
                      setEmail('')
                    }} 
                    variant="outline" 
                    className="flex-1"
                  >
                    Create Another
                  </Button>
                </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
