import { headers } from 'next/headers'
import { getCurrentUser } from './auth'
import { withPrisma } from './db'

export interface CompanyContext {
  viewingCompanyId: string
  viewingCompanyName: string | null
  isSwitchedContext: boolean
  isSuperAdmin: boolean
}

/**
 * Get the company context for the current request
 * This determines which company's data should be shown
 */
export async function getCompanyContext(requestUrl?: string): Promise<CompanyContext> {
  const user = await getCurrentUser()
  
  if (!user) {
    throw new Error('Unauthorized')
  }
  
  // Check if user is super admin
  const isSuperAdmin = user.superAdmin === true
  
  if (!isSuperAdmin) {
    // Regular users always view their own company
    return {
      viewingCompanyId: user.companyId,
      viewingCompanyName: null,
      isSwitchedContext: false,
      isSuperAdmin: false
    }
  }
  
  // For super admins, check for viewAs param
  const headersList = await headers()
  const referer = headersList.get('referer') || ''
  
  // Check both referer (for page requests) and requestUrl (for API requests)
  const urlToCheck = requestUrl || referer
  const viewAsMatch = urlToCheck.match(/[?&]viewAs=([a-zA-Z0-9-_]+)/)
  const viewAsCompanyId = viewAsMatch ? viewAsMatch[1] : null
  
  if (viewAsCompanyId) {
    // Super admin is viewing as another company
    const company = await withPrisma(async (prisma) => {
      return await prisma.company.findUnique({
        where: { id: viewAsCompanyId },
        select: { id: true, name: true }
      })
    })
    
    if (company) {
      return {
        viewingCompanyId: company.id,
        viewingCompanyName: company.name,
        isSwitchedContext: true,
        isSuperAdmin: true
      }
    }
  }
  
  // Super admin viewing their own company or no viewAs param
  const userCompany = await withPrisma(async (prisma) => {
    return await prisma.company.findUnique({
      where: { id: user.companyId },
      select: { name: true }
    })
  })
  
  return {
    viewingCompanyId: user.companyId,
    viewingCompanyName: userCompany?.name || null,
    isSwitchedContext: false,
    isSuperAdmin: true
  }
}

/**
 * Get the effective company ID for data queries
 * Respects viewAs param for super admins
 */
export async function getEffectiveCompanyId(requestUrl?: string): Promise<string> {
  const context = await getCompanyContext(requestUrl)
  return context.viewingCompanyId
}

/**
 * Check if user has permission to view data for a specific company
 */
export async function canViewCompany(companyId: string): Promise<boolean> {
  const user = await getCurrentUser()
  
  if (!user) return false
  
  // Super admins can view any company
  if (user.superAdmin) return true
  
  // Regular users can only view their own company
  return user.companyId === companyId
}

