'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface CommissionRole {
  id: string
  name: string
  defaultRate: number
  description: string | null
  _count: {
    users: number
  }
}

export default function CommissionRolesPage() {
  const [roles, setRoles] = useState<CommissionRole[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingRole, setEditingRole] = useState<CommissionRole | null>(null)
  
  const [formData, setFormData] = useState({
    name: '',
    defaultRate: '10',
    description: ''
  })
  
  useEffect(() => {
    fetchRoles()
  }, [])
  
  const fetchRoles = async () => {
    try {
      const res = await fetch('/api/admin/commission-roles')
      const data = await res.json()
      setRoles(data)
    } catch (error) {
      console.error('Failed to fetch roles:', error)
    }
    setLoading(false)
  }
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    try {
      const url = editingRole
        ? `/api/admin/commission-roles/${editingRole.id}`
        : '/api/admin/commission-roles'
      
      const method = editingRole ? 'PUT' : 'POST'
      
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          defaultRate: parseFloat(formData.defaultRate) / 100 // Convert to decimal
        })
      })
      
      if (!res.ok) {
        const error = await res.json()
        alert(error.error)
        return
      }
      
      // Reset form
      setFormData({ name: '', defaultRate: '10', description: '' })
      setShowForm(false)
      setEditingRole(null)
      
      // Refresh list
      fetchRoles()
      
    } catch (error) {
      console.error('Failed to save role:', error)
      alert('Failed to save role')
    }
  }
  
  const handleEdit = (role: CommissionRole) => {
    setEditingRole(role)
    setFormData({
      name: role.name,
      defaultRate: (role.defaultRate * 100).toString(),
      description: role.description || ''
    })
    setShowForm(true)
  }
  
  const handleDelete = async (role: CommissionRole) => {
    if (!confirm(`Delete role "${role.name}"?`)) return
    
    try {
      const res = await fetch(`/api/admin/commission-roles/${role.id}`, {
        method: 'DELETE'
      })
      
      if (!res.ok) {
        const error = await res.json()
        alert(error.error)
        return
      }
      
      fetchRoles()
      
    } catch (error) {
      console.error('Failed to delete role:', error)
      alert('Failed to delete role')
    }
  }
  
  if (loading) {
    return <div className="container mx-auto py-10">Loading...</div>
  }
  
  return (
    <div className="container mx-auto py-10 max-w-4xl">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold">Commission Roles</h1>
        <Button
          onClick={() => {
            setShowForm(true)
            setEditingRole(null)
            setFormData({ name: '', defaultRate: '10', description: '' })
          }}
        >
          + Create Role
        </Button>
      </div>
      
      {/* Create/Edit Form */}
      {showForm && (
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>
              {editingRole ? 'Edit Role' : 'Create New Role'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">
                  Role Name *
                </label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                  placeholder="e.g., Closer, Setter, DM Setter"
                  required
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-2">
                  Default Commission Rate (%) *
                </label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  value={formData.defaultRate}
                  onChange={(e) => setFormData({...formData, defaultRate: e.target.value})}
                  required
                />
                <p className="text-sm text-gray-500 mt-1">
                  Users assigned to this role will receive this commission rate by default
                </p>
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-2">
                  Description
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({...formData, description: e.target.value})}
                  className="w-full border rounded-md p-2"
                  rows={3}
                  placeholder="Optional description of this role..."
                />
              </div>
              
              <div className="flex gap-2">
                <Button type="submit">
                  {editingRole ? 'Update Role' : 'Create Role'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setShowForm(false)
                    setEditingRole(null)
                  }}
                >
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}
      
      {/* Roles List */}
      <div className="space-y-4">
        {roles.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-gray-500">
              No commission roles yet. Create one to get started!
            </CardContent>
          </Card>
        ) : (
          roles.map((role) => (
            <Card key={role.id}>
              <CardContent className="py-6">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold">{role.name}</h3>
                    <p className="text-2xl font-bold text-blue-600 mt-2">
                      {(role.defaultRate * 100).toFixed(1)}%
                    </p>
                    {role.description && (
                      <p className="text-sm text-gray-600 mt-2">
                        {role.description}
                      </p>
                    )}
                    <p className="text-sm text-gray-500 mt-2">
                      {role._count.users} user{role._count.users !== 1 ? 's' : ''} assigned
                    </p>
                  </div>
                  
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleEdit(role)}
                    >
                      Edit
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDelete(role)}
                      disabled={role._count.users > 0}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  )
}
