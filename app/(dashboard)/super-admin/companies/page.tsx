'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

interface Company {
  id: string
  name: string
  email: string
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
      <div className="mb-8 flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold mb-2">All Companies</h1>
          <p className="text-gray-600">Manage and view all companies in the system</p>
        </div>
        <Badge variant="default">{companies.length} companies</Badge>
      </div>
      
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

