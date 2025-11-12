'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { COMMON_TIMEZONES } from '@/lib/timezone'
import Link from 'next/link'

interface CompanyDetails {
  id: string
  name: string
  email: string
  processor: string
  timezone: string
  createdAt: string
  updatedAt: string
  User: any[]
  CommissionRole: any[]
  _count: {
    Appointment: number
    Sale: number
    Commission: number
  }
}

export default function CompanyDetailsPage() {
  const params = useParams()
  const router = useRouter()
  const [company, setCompany] = useState<CompanyDetails | null>(null)
  const [loading, setLoading] = useState(true)
  const [timezoneValue, setTimezoneValue] = useState<string>('UTC')
  const [timezoneMessage, setTimezoneMessage] = useState<string | null>(null)
  const [timezoneError, setTimezoneError] = useState<string | null>(null)
  const [timezoneSaving, setTimezoneSaving] = useState<boolean>(false)
  
  useEffect(() => {
    fetch(`/api/super-admin/companies/${params.id}`)
      .then(res => res.json())
      .then(data => {
        setCompany(data)
        setLoading(false)
      })
      .catch(err => {
        console.error('Failed to fetch company:', err)
        setLoading(false)
      })
  }, [params.id])

  useEffect(() => {
    if (company?.timezone) {
      setTimezoneValue(company.timezone)
    }
  }, [company?.timezone])
  
  const handleViewAs = () => {
    const searchParams = new URLSearchParams()
    searchParams.set('viewAs', company!.id)
    router.push(`/dashboard?${searchParams.toString()}`)
  }

  const handleTimezoneUpdate = async () => {
    if (!company) return
    setTimezoneSaving(true)
    setTimezoneMessage(null)
    setTimezoneError(null)

    try {
      const res = await fetch(`/api/super-admin/companies/${company.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timezone: timezoneValue })
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data?.error || 'Failed to update timezone')
      }

      setCompany((prev) => (prev ? { ...prev, timezone: data.company.timezone } : prev))
      setTimezoneMessage('Timezone updated successfully.')
    } catch (error: any) {
      console.error('Failed to update timezone:', error)
      setTimezoneError(error?.message || 'Failed to update timezone')
    } finally {
      setTimezoneSaving(false)
    }
  }
  
  if (loading) return <div className="container mx-auto py-10">Loading...</div>
  if (!company) return <div className="container mx-auto py-10">Company not found</div>
  
  return (
    <div className="container mx-auto py-10">
      <div className="mb-8">
        <Link href="/super-admin/companies" className="text-purple-600 hover:text-purple-800 mb-4 inline-block">
          ← Back to All Companies
        </Link>
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold mb-2">{company.name}</h1>
            <p className="text-gray-600">{company.email}</p>
          </div>
          <Button onClick={handleViewAs}>
            View as This Company
          </Button>
        </div>
      </div>
      
      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-gray-600">
              Users
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{company.User.length}</div>
            <p className="text-xs text-gray-500 mt-1">Active members</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-gray-600">
              Appointments
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{company._count.Appointment}</div>
            <p className="text-xs text-gray-500 mt-1">Total scheduled</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-gray-600">
              Sales
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{company._count.Sale}</div>
            <p className="text-xs text-gray-500 mt-1">Total transactions</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-gray-600">
              Commissions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{company._count.Commission}</div>
            <p className="text-xs text-gray-500 mt-1">Total paid</p>
          </CardContent>
        </Card>
      </div>
      
      {/* Users */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Users ({company.User.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2">Name</th>
                  <th className="text-left py-2">Email</th>
                  <th className="text-left py-2">Role</th>
                  <th className="text-right py-2">Appointments</th>
                  <th className="text-right py-2">Commissions</th>
                </tr>
              </thead>
              <tbody>
                {company.User.map((user) => (
                  <tr key={user.id} className="border-b">
                    <td className="py-2">{user.name}</td>
                    <td className="py-2 text-sm text-gray-600">{user.email}</td>
                    <td className="py-2">
                      <Badge variant="default">{user.role}</Badge>
                    </td>
                    <td className="py-2 text-right">{user._count.AppointmentsAsCloser}</td>
                    <td className="py-2 text-right">{user._count.Commission}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
      
      {/* Company Info */}
      <Card>
        <CardHeader>
          <CardTitle>Company Information</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <p className="text-sm text-gray-600 mb-1">Processor</p>
              <p className="font-medium">{company.processor}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600 mb-1">Created</p>
              <p className="font-medium">
                {new Date(company.createdAt).toLocaleDateString()}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-600 mb-1">Commission Roles</p>
              <p className="font-medium">{company.CommissionRole.length}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600 mb-1">Last Updated</p>
              <p className="font-medium">
                {new Date(company.updatedAt).toLocaleDateString()}
              </p>
            </div>
            <div className="md:col-span-2">
              <p className="text-sm text-gray-600 mb-2">Timezone</p>
              <div className="flex flex-col gap-3 md:flex-row md:items-center">
                <Select value={timezoneValue} onValueChange={setTimezoneValue}>
                  <SelectTrigger className="w-full md:w-72">
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
                <Button
                  onClick={handleTimezoneUpdate}
                  disabled={timezoneSaving || timezoneValue === company.timezone}
                >
                  {timezoneSaving ? 'Saving...' : 'Save Timezone'}
                </Button>
              </div>
              {timezoneMessage && (
                <p className="text-sm text-green-600 mt-2">{timezoneMessage}</p>
              )}
              {timezoneError && (
                <p className="text-sm text-red-600 mt-2">{timezoneError}</p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

