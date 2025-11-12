'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { COMMON_TIMEZONES } from '@/lib/timezone'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

interface Company {
  id: string
  name: string
  email: string
  processor?: string
  timezone: string
  createdAt: string
  _count: {
    User: number
    Appointment: number
  }
}

export default function CompaniesPage() {
  const [companies, setCompanies] = useState<Company[]>([])
  const [filteredCompanies, setFilteredCompanies] = useState<Company[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [companyName, setCompanyName] = useState('')
  const [companyEmail, setCompanyEmail] = useState('')
  const [processor, setProcessor] = useState('whop')
  const [timezone, setTimezone] = useState<string>('UTC')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [createSuccess, setCreateSuccess] = useState<{
    inviteCode: string
    webhookUrl: string
    processor: string
  } | null>(null)
  const router = useRouter()
  
  useEffect(() => {
    fetch('/api/super-admin/companies')
      .then(res => res.json())
      .then(data => {
        setCompanies(data)
        setFilteredCompanies(data)
        setLoading(false)
      })
      .catch(err => {
        console.error('Failed to fetch companies:', err)
        setLoading(false)
      })
  }, [])
  
  useEffect(() => {
    if (!searchQuery) {
      setFilteredCompanies(companies)
      return
    }
    
    const filtered = companies.filter(c =>
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.email.toLowerCase().includes(searchQuery.toLowerCase())
    )
    setFilteredCompanies(filtered)
  }, [searchQuery, companies])
  
  const handleViewAs = (companyId: string, companyName: string) => {
    const params = new URLSearchParams()
    params.set('viewAs', companyId)
    router.push(`/dashboard?${params.toString()}`)
  }
  
  const handleDeleteCompany = async (companyId: string, companyName: string) => {
    if (!confirm(`Are you sure you want to delete ${companyName}? This will delete all associated users, appointments, and data. This action cannot be undone.`)) {
      return
    }
    
    try {
      const res = await fetch(`/api/super-admin/companies/${companyId}`, {
        method: 'DELETE',
        credentials: 'include'
      })
      
      if (!res.ok) {
        const error = await res.json()
        alert(error.error || 'Failed to delete company')
        return
      }
      
      // Refresh the companies list
      setCompanies(companies.filter(c => c.id !== companyId))
      setFilteredCompanies(filteredCompanies.filter(c => c.id !== companyId))
      alert('Company deleted successfully')
    } catch (error) {
      console.error('Failed to delete company:', error)
      alert('Failed to delete company')
    }
  }
  
  const resetCreateForm = () => {
    setCompanyName('')
    setCompanyEmail('')
    setProcessor('whop')
    setTimezone('UTC')
    setCreateError(null)
  }

  const handleCreateCompany = async (e: React.FormEvent) => {
    e.preventDefault()
    setCreateError(null)
    setCreateSuccess(null)
    setCreating(true)

    try {
      const payload: Record<string, string> = {
        name: companyName.trim(),
        processor,
        timezone
      }

      if (companyEmail.trim()) {
        payload.email = companyEmail.trim()
      }

      const res = await fetch('/api/super-admin/companies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to create company')
      }

      const { company, inviteCode, webhookUrl } = data
      setCompanies(prev => [company, ...prev])
      setCreateSuccess({
        inviteCode,
        webhookUrl,
        processor: company.processor || processor
      })
      resetCreateForm()
    } catch (error: any) {
      setCreateError(error?.message || 'Failed to create company')
    } finally {
      setCreating(false)
    }
  }
  
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    })
  }
  
  if (loading) return <div className="container mx-auto py-10">Loading...</div>
  
  return (
    <div className="container mx-auto py-10">
      <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold mb-2">All Companies</h1>
          <p className="text-gray-600">Manage and view all companies in the system</p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            onClick={() => {
              setShowCreateForm(prev => !prev)
              setCreateError(null)
              if (showCreateForm) {
                setCreateSuccess(null)
                resetCreateForm()
              }
            }}
            variant={showCreateForm ? 'outline' : 'default'}
          >
            {showCreateForm ? 'Close' : 'Create Company'}
          </Button>
          <Badge variant="default">{companies.length} companies</Badge>
        </div>
      </div>

      {showCreateForm && (
        <Card className="mb-6 border-dashed">
          <CardHeader>
            <CardTitle>Create a new company</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <form onSubmit={handleCreateCompany} className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium mb-2">
                    Company Name
                  </label>
                  <Input
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    placeholder="Acme Inc."
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Contact Email (optional)
                  </label>
                  <Input
                    type="email"
                    value={companyEmail}
                    onChange={(e) => setCompanyEmail(e.target.value)}
                    placeholder="ops@company.com"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Payment Processor
                  </label>
                  <Select value={processor} onValueChange={setProcessor}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select processor" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="whop">Whop</SelectItem>
                      <SelectItem value="stripe">Stripe</SelectItem>
                      <SelectItem value="nmi">NMI</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Timezone
                  </label>
                  <Select value={timezone} onValueChange={setTimezone}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select timezone" />
                    </SelectTrigger>
                    <SelectContent className="max-h-64 overflow-y-auto">
                      {COMMON_TIMEZONES.map((tz) => (
                        <SelectItem key={tz} value={tz}>
                          {tz}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {createError && (
                <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  {createError}
                </div>
              )}

              {createSuccess && (
                <div className="space-y-4">
                  <div className="rounded-md border border-green-200 bg-green-50 p-4">
                    <h3 className="font-semibold text-green-900 mb-2">Company created!</h3>
                    <p className="text-sm text-green-700">
                      Share the invite code and add the webhook URL to the {createSuccess.processor} account.
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">
                      Invite Code
                    </label>
                    <div className="bg-gray-900 text-white font-mono text-lg tracking-widest px-4 py-3 rounded-md text-center">
                      {createSuccess.inviteCode}
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">
                      Webhook URL
                    </label>
                    <div className="bg-gray-100 p-3 rounded-md text-sm font-mono break-all">
                      {createSuccess.webhookUrl}
                    </div>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-end gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    resetCreateForm()
                    setCreateSuccess(null)
                  }}
                >
                  Reset
                </Button>
                <Button type="submit" disabled={creating || companyName.trim().length === 0}>
                  {creating ? 'Creating...' : 'Create Company'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}
      
      
      {/* Search */}
      <Card className="mb-6">
        <CardContent className="py-4">
          <Input
            type="text"
            placeholder="Search companies by name or email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="max-w-md"
          />
        </CardContent>
      </Card>
      
      {/* Companies List */}
      <Card>
        <CardHeader>
          <CardTitle>Companies ({filteredCompanies.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-3 px-4">Company</th>
                  <th className="text-left py-3 px-4">Contact</th>
                  <th className="text-right py-3 px-4">Users</th>
                  <th className="text-right py-3 px-4">Appointments</th>
                  <th className="text-left py-3 px-4">Created</th>
                  <th className="text-right py-3 px-4">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredCompanies.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-8 text-gray-500">
                      No companies found
                    </td>
                  </tr>
                ) : (
                  filteredCompanies.map((company) => (
                    <tr key={company.id} className="border-b hover:bg-gray-50">
                      <td className="py-3 px-4">
                        <div className="font-medium text-gray-900">{company.name}</div>
                        <div className="text-sm text-gray-500">{company.id}</div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="text-sm text-gray-600">{company.email}</div>
                        <div className="text-xs text-gray-400">{company.timezone}</div>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <span className="font-medium">{company._count.User}</span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <span className="font-medium">{company._count.Appointment}</span>
                      </td>
                      <td className="py-3 px-4">
                        <div className="text-sm text-gray-500">{formatDate(company.createdAt)}</div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex justify-end gap-2">
                          <Link
                            href={`/super-admin/companies/${company.id}`}
                            className="text-sm text-purple-600 hover:text-purple-800"
                          >
                            Details
                          </Link>
                          <button
                            onClick={() => handleViewAs(company.id, company.name)}
                            className="text-sm text-blue-600 hover:text-blue-800"
                          >
                            View As
                          </button>
                          <button
                            onClick={() => handleDeleteCompany(company.id, company.name)}
                            className="text-sm text-red-600 hover:text-red-800"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

