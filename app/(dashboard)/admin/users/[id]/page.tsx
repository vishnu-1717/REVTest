'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import Link from 'next/link'

interface UserDetails {
  id: string
  name: string
  email: string
  role: string
  commissionRole: {
    name: string
    defaultRate: number
  } | null
  customCommissionRate: number | null
  canViewTeamMetrics: boolean
  createdAt: string
}

interface Stats {
  totalAppointments: number
  showed: number
  signed: number
  showRate: number
  closeRate: number
  totalRevenue: number
  totalCommissions: number
  pendingCommissions: number
  paidCommissions: number
}

export default function UserDetailPage() {
  const params = useParams()
  const [user, setUser] = useState<UserDetails | null>(null)
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  
  useEffect(() => {
    if (params.id) {
      fetchUser()
      fetchStats()
    }
  }, [params.id])
  
  const fetchUser = async () => {
    try {
      const res = await fetch(`/api/admin/users/${params.id}`)
      if (!res.ok) throw new Error('Failed to fetch user')
      const data = await res.json()
      setUser(data)
    } catch (error) {
      console.error('Failed to fetch user:', error)
    } finally {
      setLoading(false)
    }
  }
  
  const fetchStats = async () => {
    try {
      const res = await fetch(`/api/admin/users/${params.id}/stats`)
      if (!res.ok) throw new Error('Failed to fetch stats')
      const data = await res.json()
      setStats(data)
    } catch (error) {
      console.error('Failed to fetch stats:', error)
    }
  }
  
  if (loading) {
    return <div className="container mx-auto py-10">Loading...</div>
  }
  
  if (!user || !stats) {
    return <div className="container mx-auto py-10">User not found</div>
  }
  
  const commissionRate = user.customCommissionRate !== null
    ? user.customCommissionRate * 100
    : user.commissionRole
    ? user.commissionRole.defaultRate * 100
    : 0
  
  return (
    <div className="container mx-auto py-10 max-w-6xl">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold">{user.name}</h1>
          <p className="text-gray-500">{user.email}</p>
        </div>
        <div className="flex gap-2">
          <Link
            href={`/admin/users/${user.id}/edit`}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            Edit User
          </Link>
          <Link
            href="/admin/users"
            className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300"
          >
            Back to Users
          </Link>
        </div>
      </div>
      
      {/* User Info */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle>User Information</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-6">
            <div>
              <p className="text-sm text-gray-500">Role</p>
              <p className="font-semibold capitalize">{user.role}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Status</p>
              <p className="font-semibold">
                {user.isActive ? (
                  <span className="text-green-600">Active</span>
                ) : (
                  <span className="text-gray-600">Inactive</span>
                )}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Commission Role</p>
              <p className="font-semibold">
                {user.commissionRole?.name || 'Not assigned'}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Commission Rate</p>
              <p className="font-semibold">
                {commissionRate.toFixed(1)}%
                {user.customCommissionRate !== null && (
                  <span className="text-sm text-gray-500 ml-2">(custom)</span>
                )}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Can View Team Metrics</p>
              <p className="font-semibold">
                {user.canViewTeamMetrics ? 'Yes' : 'No'}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Member Since</p>
              <p className="font-semibold">
                {new Date(user.createdAt).toLocaleDateString()}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
      
      {/* Performance Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-gray-600">
              Total Appointments
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats.totalAppointments}</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-gray-600">
              Show Rate
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats.showRate}%</div>
            <p className="text-sm text-gray-500 mt-1">
              {stats.showed} showed up
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-gray-600">
              Close Rate
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats.closeRate}%</div>
            <p className="text-sm text-gray-500 mt-1">
              {stats.signed} closed
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-gray-600">
              Total Revenue
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              ${stats.totalRevenue.toLocaleString()}
            </div>
          </CardContent>
        </Card>
      </div>
      
      {/* Commission Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-gray-600">
              Total Commissions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              ${stats.totalCommissions.toLocaleString()}
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-gray-600">
              Pending
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-yellow-600">
              ${stats.pendingCommissions.toLocaleString()}
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-gray-600">
              Paid
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-600">
              ${stats.paidCommissions.toLocaleString()}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
