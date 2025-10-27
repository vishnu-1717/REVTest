'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface User {
  id: string
  name: string
  email: string
  role: string
  commissionRoleId: string | null
  customCommissionRate: number | null
  canViewTeamMetrics: boolean
}

interface CommissionRole {
  id: string
  name: string
  defaultRate: number
}

export default function EditUserPage() {
  const params = useParams()
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [roles, setRoles] = useState<CommissionRole[]>([])
  
  const [formData, setFormData] = useState({
    name: '',
    role: 'rep',
    commissionRoleId: '',
    customCommissionRate: '',
    canViewTeamMetrics: false
  })
  
  useEffect(() => {
    if (params.id) {
      fetchUser()
      fetchRoles()
    }
  }, [params.id])
  
  const fetchUser = async () => {
    try {
      const res = await fetch(`/api/admin/users/${params.id}`)
      const user: User = await res.json()
      
      setFormData({
        name: user.name,
        role: user.role,
        commissionRoleId: user.commissionRoleId || '',
        customCommissionRate: user.customCommissionRate 
          ? (user.customCommissionRate * 100).toString()
          : '',
        canViewTeamMetrics: user.canViewTeamMetrics
      })
    } catch (error) {
      console.error('Failed to fetch user:', error)
    } finally {
      setLoading(false)
    }
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
    setSaving(true)
    
    try {
      const res = await fetch(`/api/admin/users/${params.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      })
      
      if (!res.ok) {
        const error = await res.json()
        alert(error.error)
        return
      }
      
      // Redirect back to user detail
      router.push(`/admin/users/${params.id}`)
      
    } catch (error) {
      console.error('Failed to update user:', error)
      alert('Failed to update user')
    } finally {
      setSaving(false)
    }
  }
  
  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this user?')) return
    
    try {
      const res = await fetch(`/api/admin/users/${params.id}`, {
        method: 'DELETE'
      })
      
      const result = await res.json()
      
      if (!res.ok) {
        alert(result.error)
        return
      }
      
      alert(result.message || 'User deleted')
      router.push('/admin/users')
      
    } catch (error) {
      console.error('Failed to delete user:', error)
      alert('Failed to delete user')
    }
  }
  
  if (loading) {
    return <div className="container mx-auto py-10">Loading...</div>
  }
  
  return (
    <div className="container mx-auto py-10 max-w-2xl">
      <h1 className="text-3xl font-bold mb-8">Edit User</h1>
      
      <Card>
        <CardHeader>
          <CardTitle>User Details</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block text-sm font-medium mb-2">
                Name *
              </label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({...formData, name: e.target.value})}
                required
              />
            </div>
            
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
                <option value="">-- No Role Assigned --</option>
                {roles.map(role => (
                  <option key={role.id} value={role.id}>
                    {role.name} ({(role.defaultRate * 100).toFixed(1)}%)
                  </option>
                ))}
              </select>
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
                This overrides the commission role's default rate
              </p>
            </div>
            
            <div className="space-y-3">
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
              
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="isActive"
                  checked={formData.isActive}
                  onChange={(e) => setFormData({...formData, isActive: e.target.checked})}
                  className="mr-2"
                />
                <label htmlFor="isActive" className="text-sm">
                  Account is active
                </label>
              </div>
            </div>
            
            <div className="flex gap-2 pt-4 border-t">
              <Button type="submit" disabled={saving}>
                {saving ? 'Saving...' : 'Save Changes'}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => router.push(`/admin/users/${params.id}`)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={handleDelete}
                className="ml-auto text-red-600 hover:text-red-700"
              >
                Delete User
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
