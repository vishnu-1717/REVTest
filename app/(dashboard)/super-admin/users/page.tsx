'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'

interface User {
  id: string
  name: string
  email: string
  role: string
  superAdmin: boolean
  isActive: boolean
  Company: {
    name: string
  }
  commissionRole: {
    name: string
  } | null
  _count: {
    AppointmentsAsCloser: number
    Commission: number
  }
}

export default function SuperAdminUsersPage() {
  const [users, setUsers] = useState<User[]>([])
  const [filteredUsers, setFilteredUsers] = useState<User[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(true)
  
  useEffect(() => {
    fetch('/api/super-admin/users')
      .then(res => res.json())
      .then(data => {
        setUsers(data)
        setFilteredUsers(data)
        setLoading(false)
      })
      .catch(err => {
        console.error('Failed to fetch users:', err)
        setLoading(false)
      })
  }, [])
  
  useEffect(() => {
    if (!searchQuery) {
      setFilteredUsers(users)
      return
    }
    
    const filtered = users.filter(u =>
      u.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.Company.name.toLowerCase().includes(searchQuery.toLowerCase())
    )
    setFilteredUsers(filtered)
  }, [searchQuery, users])
  
  const handleViewAs = (companyId: string) => {
    const params = new URLSearchParams()
    params.set('viewAs', companyId)
    window.location.href = `/dashboard?${params.toString()}`
  }
  
  if (loading) return <div className="container mx-auto py-10">Loading...</div>
  
  return (
    <div className="container mx-auto py-10">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">All Users</h1>
        <p className="text-gray-600">Manage users across all companies</p>
      </div>
      
      {/* Search */}
      <Card className="mb-6">
        <CardContent className="py-4">
          <Input
            type="text"
            placeholder="Search users by name, email, or company..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="max-w-md"
          />
        </CardContent>
      </Card>
      
      {/* Users List */}
      <Card>
        <CardHeader>
          <CardTitle>Users ({filteredUsers.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-3 px-4">User</th>
                  <th className="text-left py-3 px-4">Company</th>
                  <th className="text-left py-3 px-4">Role</th>
                  <th className="text-right py-3 px-4">Appointments</th>
                  <th className="text-right py-3 px-4">Commissions</th>
                  <th className="text-left py-3 px-4">Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-8 text-gray-500">
                      No users found
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map((user) => (
                    <tr key={user.id} className="border-b hover:bg-gray-50">
                      <td className="py-3 px-4">
                        <div className="font-medium text-gray-900">{user.name}</div>
                        <div className="text-sm text-gray-500">{user.email}</div>
                      </td>
                      <td className="py-3 px-4">
                        <button
                          onClick={() => handleViewAs(user.Company.name)}
                          className="text-sm text-purple-600 hover:text-purple-800"
                        >
                          {user.Company.name}
                        </button>
                      </td>
                      <td className="py-3 px-4">
                        <Badge variant={user.superAdmin ? "default" : "secondary"}>
                          {user.role}{user.superAdmin && ' (Super Admin)'}
                        </Badge>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <span className="font-medium">{user._count.AppointmentsAsCloser}</span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <span className="font-medium">{user._count.Commission}</span>
                      </td>
                      <td className="py-3 px-4">
                        <Badge variant={user.isActive ? "default" : "destructive"}>
                          {user.isActive ? 'Active' : 'Inactive'}
                        </Badge>
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

