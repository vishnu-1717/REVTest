'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import Link from 'next/link'

interface User {
  id: string
  name: string
  email: string
  role: string
  isActive: boolean
  commissionRole: {
    id: string
    name: string
    defaultRate: number
  } | null
  customCommissionRate: number | null
  canViewTeamMetrics: boolean
  _count: {
    AppointmentsAsCloser: number
    Commission: number
  }
  createdAt: string
  Company?: {
    id: string
    name: string
  } | null
}

interface CommissionRole {
  id: string
  name: string
  defaultRate: number
}

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([])
  const [roles, setRoles] = useState<CommissionRole[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [isSuperAdmin, setIsSuperAdmin] = useState(false)
  
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    role: 'rep',
    commissionRoleId: '',
    customCommissionRate: '',
    canViewTeamMetrics: false
  })
  
  useEffect(() => {
    fetchUsers()
    fetchRoles()
  }, [])
  
  useEffect(() => {
    // Detect if user is viewing as super admin (multiple companies visible)
    const hasMultipleCompanies = new Set(users.map(u => u.Company?.id).filter(Boolean)).size > 1
    const hasCompanyColumn = users.some(u => u.Company !== null && u.Company !== undefined)
    setIsSuperAdmin(hasMultipleCompanies || hasCompanyColumn)
  }, [users])
  
  const fetchUsers = async () => {
    try {
      const res = await fetch('/api/admin/users')
      const data = await res.json()
      setUsers(data)
    } catch (error) {
      console.error('Failed to fetch users:', error)
    }
    setLoading(false)
  }
  
  const fetchRoles = async () => {
    try {
      const res = await fetch('/api/admin/commission-roles')
      const data = await res.json()
      setRoles(data)
    } catch (error) {
      console.error('Failed to fetch roles:', error)
    }
  }
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      })
      
      if (!res.ok) {
        const error = await res.json()
        alert(error.error)
        return
      }
      
      // Reset form
      setFormData({
        name: '',
        email: '',
        role: 'rep',
        commissionRoleId: '',
        customCommissionRate: '',
        canViewTeamMetrics: false
      })
      setShowForm(false)
      
      // Refresh list
      fetchUsers()
      
      alert('User created! They can now sign up with this email.')
      
    } catch (error) {
      console.error('Failed to create user:', error)
      alert('Failed to create user')
    }
  }
  
  const handleImpersonate = async (userId: string) => {
    try {
      const res = await fetch('/api/admin/impersonate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId })
      })
      
      if (!res.ok) {
        const error = await res.json()
        alert(error.error || 'Failed to impersonate user')
        return
      }
      
      // Refresh page to show impersonation state
      window.location.href = '/dashboard'
      
    } catch (error) {
      console.error('Failed to impersonate user:', error)
      alert('Failed to impersonate user')
    }
  }
  
  const getCommissionRate = (user: User) => {
    if (user.customCommissionRate !== null) {
      return `${(user.customCommissionRate * 100).toFixed(1)}% (custom)`
    }
    if (user.commissionRole) {
      return `${(user.commissionRole.defaultRate * 100).toFixed(1)}% (${user.commissionRole.name})`
    }
    return 'Not set'
  }
  
  if (loading) {
    return <div className="container mx-auto py-10">Loading...</div>
  }
  
  return (
    <div className="container mx-auto py-10 max-w-6xl">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold">Team Members</h1>
        <Button onClick={() => setShowForm(true)}>
          + Add User
        </Button>
      </div>
      
      {/* Create Form */}
      {showForm && (
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Add New User</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Name *
                  </label>
                  <Input
                    value={formData.name}
                    onChange={(e) => setFormData({...formData, name: e.target.value})}
                    placeholder="John Doe"
                    required
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Email *
                  </label>
                  <Input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({...formData, email: e.target.value})}
                    placeholder="john@example.com"
                    required
                  />
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Role *
                  </label>
                  <select
                    value={formData.role}
                    onChange={(e) => setFormData({...formData, role: e.target.value})}
                    className="w-full border rounded-md p-2"
                  >
                    <option value="rep">Rep</option>
                    <option value="closer">Closer</option>
                    <option value="setter">Setter</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Commission Role
                  </label>
                  <select
                    value={formData.commissionRoleId}
                    onChange={(e) => setFormData({...formData, commissionRoleId: e.target.value})}
                    className="w-full border rounded-md p-2"
                  >
                    <option value="">-- Select Role --</option>
                    {roles.map(role => (
                      <option key={role.id} value={role.id}>
                        {role.name} ({(role.defaultRate * 100).toFixed(1)}%)
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-2">
                  Custom Commission Rate (%)
                </label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  value={formData.customCommissionRate}
                  onChange={(e) => setFormData({...formData, customCommissionRate: e.target.value})}
                  placeholder="Leave blank to use role default"
                />
                <p className="text-sm text-gray-500 mt-1">
                  Optional: Override the commission role's default rate for this user
                </p>
              </div>
              
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="canViewTeamMetrics"
                  checked={formData.canViewTeamMetrics}
                  onChange={(e) => setFormData({...formData, canViewTeamMetrics: e.target.checked})}
                  className="mr-2"
                />
                <label htmlFor="canViewTeamMetrics" className="text-sm">
                  Can view team-wide metrics
                </label>
              </div>
              
              <div className="flex gap-2">
                <Button type="submit">Create User</Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowForm(false)}
                >
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}
      
      {/* Users List */}
      <div className="space-y-4">
        {users.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-gray-500">
              No users yet. Add team members to get started!
            </CardContent>
          </Card>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Email
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Role
                  </th>
                  {isSuperAdmin && (
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Company
                    </th>
                  )}
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Commission
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Stats
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {users.map((user) => (
                  <tr key={user.id}>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="font-medium text-gray-900">{user.name}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {user.email}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800">
                        {user.role}
                      </span>
                    </td>
                    {isSuperAdmin && (
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {user.Company?.name || 'N/A'}
                      </td>
                    )}
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      {getCommissionRate(user)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {user._count.AppointmentsAsCloser} appts<br/>
                      {user._count.Commission} commissions
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {user.isActive ? (
                        <span className="px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">
                          Active
                        </span>
                      ) : (
                        <span className="px-2 py-1 text-xs font-semibold rounded-full bg-gray-100 text-gray-800">
                          Inactive
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <button
                        onClick={() => handleImpersonate(user.id)}
                        className="text-blue-600 hover:text-blue-800 mr-3 flex items-center gap-1"
                      >
                        👁️ View As
                      </button>
                      <Link
                        href={`/admin/users/${user.id}`}
                        className="text-blue-600 hover:text-blue-800 mr-3"
                      >
                        View
                      </Link>
                      <Link
                        href={`/admin/users/${user.id}/edit`}
                        className="text-blue-600 hover:text-blue-800"
                      >
                        Edit
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
