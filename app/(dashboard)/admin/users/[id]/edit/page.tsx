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
  isActive: boolean
  commissionRoleId: string | null
  customCommissionRate: number | null
  canViewTeamMetrics: boolean
  ghlUserId: string | null
}

interface GHLUser {
  id: string
  name: string
  email?: string
  role?: string
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
  const [ghlUsers, setGhlUsers] = useState<GHLUser[]>([])
  const [loadingGhlUsers, setLoadingGhlUsers] = useState(false)
  
  const [formData, setFormData] = useState({
    name: '',
    role: 'rep',
    commissionRoleId: '',
    customCommissionRate: '',
    canViewTeamMetrics: false,
    isActive: true,
    ghlUserId: ''
  })
  
  useEffect(() => {
    if (params.id) {
      fetchUser()
      fetchRoles()
    }
  }, [params.id])
  
  const fetchUser = async () => {
    try {
      const res = await fetch(withViewAs(`/api/admin/users/${params.id}`))
      const user: User = await res.json()
      
      setFormData({
        name: user.name,
        role: user.role,
        commissionRoleId: user.commissionRoleId || '',
        customCommissionRate: user.customCommissionRate 
          ? (user.customCommissionRate * 100).toString()
          : '',
        canViewTeamMetrics: user.canViewTeamMetrics,
        isActive: user.isActive,
        ghlUserId: user.ghlUserId || ''
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

  const fetchGhlUsers = async () => {
    setLoadingGhlUsers(true)
    try {
      const res = await fetch(withViewAs('/api/admin/integrations/ghl/users'))
      const data = await res.json()
      if (data.success) {
        if (data.users && data.users.length > 0) {
          setGhlUsers(data.users || [])
          alert(`✅ Found ${data.users.length} GHL users`)
        } else {
          alert(data.message || '⚠️ No GHL users found. This may indicate an API issue. Check server logs for details.')
          setGhlUsers([])
        }
      } else {
        const errorMsg = data.error || 'Failed to fetch GHL users'
        const details = data.details ? `\n\nDetails: ${data.details}` : ''
        alert(`❌ ${errorMsg}${details}`)
      }
    } catch (error: any) {
      console.error('Failed to fetch GHL users:', error)
      alert(`❌ Failed to fetch GHL users: ${error.message || 'Unknown error'}\n\nCheck browser console and server logs for details.`)
    } finally {
      setLoadingGhlUsers(false)
    }
  }
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    
    try {
      const res = await fetch(withViewAs(`/api/admin/users/${params.id}`), {
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
      const res = await fetch(withViewAs(`/api/admin/users/${params.id}`), {
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
            
            <div>
              <label className="block text-sm font-medium mb-2">
                GHL User ID
              </label>
              <div className="flex gap-2">
                <select
                  value={formData.ghlUserId}
                  onChange={(e) => setFormData({...formData, ghlUserId: e.target.value})}
                  className="flex-1 border rounded-md p-2"
                  disabled={ghlUsers.length === 0}
                >
                  <option value="">-- Not mapped --</option>
                  {ghlUsers.map(ghlUser => (
                    <option key={ghlUser.id} value={ghlUser.id}>
                      {ghlUser.name} {ghlUser.email ? `(${ghlUser.email})` : ''}
                    </option>
                  ))}
                </select>
                <Button
                  type="button"
                  variant="outline"
                  onClick={fetchGhlUsers}
                  disabled={loadingGhlUsers}
                >
                  {loadingGhlUsers ? 'Loading...' : 'Fetch GHL Users'}
                </Button>
              </div>
              <p className="text-sm text-gray-500 mt-1">
                Map this user to a GHL user so appointments sync correctly. Required for appointment assignment.
              </p>
              {formData.ghlUserId && (
                <p className="text-sm text-green-600 mt-1">
                  ✓ Mapped to GHL User ID: {formData.ghlUserId}
                </p>
              )}
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
