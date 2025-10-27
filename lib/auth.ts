import { auth, currentUser } from '@clerk/nextjs/server'
import { withPrisma } from './db'
import { redirect } from 'next/navigation'

export async function getCurrentUser() {
  const { userId } = await auth()
  
  if (!userId) return null
  
  // Look up user in database by Clerk ID
  const user = await withPrisma(async (prisma) => {
    const dbUser = await prisma.user.findFirst({
      where: { clerkId: userId },
      include: {
        Company: true,
        commissionRole: true
      }
    })
    
    // If no user found, check if this is the first user (auto-create as super admin)
    if (!dbUser) {
      // Get Clerk user details
      const clerkUser = await currentUser()
      
      // Check if there are any users in the database
      const userCount = await prisma.user.count()
      const isFirstUser = userCount === 0
      
      // Auto-create user as super admin if this is the first user
      if (isFirstUser) {
        const newUser = await prisma.user.create({
          data: {
            clerkId: userId,
            email: clerkUser?.emailAddresses[0]?.emailAddress || 'unknown@example.com',
            name: clerkUser?.fullName || 'User',
            role: 'admin',
            superAdmin: true,
            companyId: 'default', // Will need to be updated when they create a company
            isActive: true
          },
          include: {
            Company: true,
            commissionRole: true
          }
        })
        
        return {
          id: newUser.id,
          email: newUser.email,
          name: newUser.name,
          role: newUser.role,
          superAdmin: newUser.superAdmin,
          companyId: newUser.companyId,
          customFields: newUser.customFields,
          Company: newUser.Company,
          commissionRole: newUser.commissionRole,
          commissionRoleId: newUser.commissionRoleId,
          customCommissionRate: newUser.customCommissionRate,
          canViewTeamMetrics: newUser.canViewTeamMetrics,
          isActive: newUser.isActive
        }
      }
      
      // Not first user, return temporary user
      return {
        id: userId,
        email: clerkUser?.emailAddresses[0]?.emailAddress || 'unknown@example.com',
        name: clerkUser?.fullName || 'User',
        role: 'user',
        superAdmin: false,
        companyId: 'default',
        customFields: {},
        Company: null,
        commissionRole: null
      }
    }
    
    return {
      id: dbUser.id,
      email: dbUser.email,
      name: dbUser.name,
      role: dbUser.role,
      superAdmin: dbUser.superAdmin,
      companyId: dbUser.companyId,
      customFields: dbUser.customFields,
      Company: dbUser.Company,
      commissionRole: dbUser.commissionRole,
      commissionRoleId: dbUser.commissionRoleId,
      customCommissionRate: dbUser.customCommissionRate,
      canViewTeamMetrics: dbUser.canViewTeamMetrics,
      isActive: dbUser.isActive
    }
  })
  
  return user
}

export async function requireAuth() {
  const { userId } = await auth()
  
  if (!userId) {
    redirect('/sign-in')
  }
  
  return await getCurrentUser()
}

export async function requireAdmin() {
  const user = await requireAuth()
  
  if (!user) {
    redirect('/sign-in')
  }
  
  if (user.role !== 'admin' && !user.superAdmin) {
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

export async function requireSuperAdmin() {
  const user = await requireAuth()
  
  if (!user) {
    redirect('/sign-in')
  }
  
  if (!user.superAdmin) {
    redirect('/dashboard')
  }
  
  return user
}

// Check if user can perform admin actions
export function canManageUsers(user: any) {
  return user?.role === 'admin' || user?.superAdmin
}

export function canManageCommissions(user: any) {
  return user?.role === 'admin' || user?.superAdmin
}

export function canViewAllData(user: any) {
  return user?.role === 'admin' || user?.superAdmin
}

export function canViewTeamMetrics(user: any) {
  return user?.role === 'admin' || user?.superAdmin || user?.canViewTeamMetrics
}

export function isSuperAdmin(user: any) {
  return user?.superAdmin === true
}