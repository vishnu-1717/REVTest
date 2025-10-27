import { auth } from '@clerk/nextjs/server'
import { withPrisma } from './db'
import { redirect } from 'next/navigation'

export async function getCurrentUser() {
  const { userId } = await auth()
  
  if (!userId) return null
  
  // For now, return a mock user until we set up proper user sync
  // In production, you'd look up the user in your database by Clerk ID
  return {
    id: userId,
    email: 'user@example.com',
    name: 'User',
    role: 'user',
    companyId: 'default',
    customFields: {},
    Company: null,
    commissionRole: null
  }
}

export async function requireAuth() {
  const { userId } = await auth()
  
  if (!userId) {
    redirect('/sign-in')
  }
  
  // Return a mock user for now
  return {
    id: userId,
    email: 'user@example.com',
    name: 'User',
    role: 'user',
    companyId: 'default',
    customFields: {},
    Company: null,
    commissionRole: null
  }
}

export async function requireAdmin() {
  const user = await requireAuth()
  
  if (user.role !== 'admin') {
    redirect('/dashboard')
  }
  
  return user
}

export async function requireRep() {
  const user = await requireAuth()
  
  if (user.role !== 'rep' && user.role !== 'closer') {
    redirect('/dashboard')
  }
  
  return user
}

// Check if user can perform admin actions
export function canManageUsers(user: any) {
  return user?.role === 'admin'
}

export function canManageCommissions(user: any) {
  return user?.role === 'admin'
}

export function canViewAllData(user: any) {
  return user?.role === 'admin'
}

export function canViewTeamMetrics(user: any) {
  return user?.role === 'admin' || user?.canViewTeamMetrics
}