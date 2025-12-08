import { getCurrentUser, getEffectiveUser, isImpersonating, getImpersonatedUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { UserButton } from '@clerk/nextjs'
import CompanySwitcher from '@/components/CompanySwitcher'
import ImpersonationBanner from '@/components/ImpersonationBanner'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // Get effective user (which may be impersonated)
  const effectiveUser = await getEffectiveUser()
  
  if (!effectiveUser) {
    redirect('/sign-in')
  }
  
  // Check if currently impersonating
  const impersonating = await isImpersonating()
  const impersonatedUser = impersonating ? await getImpersonatedUser() : null
  
  const isAdmin = effectiveUser?.role === 'admin' || effectiveUser?.superAdmin
  const isSuperAdmin = effectiveUser?.superAdmin
  
  // Get company name if available
  let currentCompanyName: string | null = null
  if (isSuperAdmin && effectiveUser.companyId) {
    // This will be filled in client-side by CompanySwitcher
    currentCompanyName = null
  }
  
  return (
    <div className="min-h-screen bg-white">
      {/* Impersonation Banner */}
      {impersonating && impersonatedUser && (
        <ImpersonationBanner 
          impersonatedUserName={impersonatedUser.name}
          impersonatedUserEmail={impersonatedUser.email}
          companyName={impersonatedUser.Company?.name || 'Unknown Company'}
        />
      )}
      
      {/* Top Navigation */}
      <nav className="border-b border-gray-200 bg-white backdrop-blur">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex">
              {/* Logo - Icon only */}
              <div className="flex-shrink-0 flex items-center">
                <Link href="/dashboard" className="flex items-center">
                  <img 
                    src="/revphlo-icon.png" 
                    alt="revphlo" 
                    className="h-12 w-auto"
                  />
                </Link>
              </div>
              
              {/* Navigation Links */}
              <div className="hidden sm:ml-6 sm:flex sm:space-x-2">
                <Link
                  href="/dashboard"
                  className="text-xs px-3 py-1.5 rounded-full border border-transparent text-gray-700 hover:border-gray-300 hover:text-gray-900 transition font-medium"
                >
                  Dashboard
                </Link>
                
                <Link
                  href="/analytics"
                  className="text-xs px-3 py-1.5 rounded-full border border-transparent text-gray-700 hover:border-gray-300 hover:text-gray-900 transition font-medium"
                >
                  Analytics
                </Link>
                
                <Link
                  href="/commissions"
                  className="text-xs px-3 py-1.5 rounded-full border border-transparent text-gray-700 hover:border-gray-300 hover:text-gray-900 transition font-medium"
                >
                  Commissions
                </Link>
                
                <Link
                  href="/leaderboard"
                  className="text-xs px-3 py-1.5 rounded-full border border-transparent text-gray-700 hover:border-gray-300 hover:text-gray-900 transition font-medium"
                >
                  Leaderboard
                </Link>
                
                <Link
                  href="/ai-chat"
                  className="text-xs px-3 py-1.5 rounded-full border border-transparent text-gray-700 hover:border-gray-300 hover:text-gray-900 transition font-medium"
                >
                  AI Chat
                </Link>
                
                {isAdmin && (
                  <div className="relative group flex items-center">
                    <button className="text-xs px-3 py-1.5 rounded-full border border-transparent text-gray-600 hover:border-gray-300 hover:text-gray-900 transition">
                      Admin
                      <svg className="ml-1 h-3 w-3 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                    
                    {/* Dropdown Menu */}
                    <div className="absolute left-0 top-full pt-1 w-56 bg-white rounded-lg shadow-lg border border-gray-200 z-10 hidden group-hover:block">
                      <div className="py-1">
                        <Link
                          href="/admin/users"
                          className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                        >
                          Users
                        </Link>
                        <Link
                          href="/admin/roles"
                          className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                        >
                          Commission Roles
                        </Link>
                        <Link
                          href="/admin/payments"
                          className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                        >
                          Payments
                        </Link>
                        <Link
                          href="/admin/calendars"
                          className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                        >
                          Calendars
                        </Link>
                        <div className="border-t border-gray-200 my-1" />
                        <Link
                          href="/admin/integrations"
                          className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                        >
                          Integrations
                        </Link>
                        <Link
                          href="/admin/pcn-qa"
                          className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                        >
                          PCN QA
                        </Link>
                      </div>
                    </div>
                  </div>
                )}
                
                {isSuperAdmin && (
                  <div className="relative group flex items-center">
                    <button className="text-xs px-3 py-1.5 rounded-full border border-transparent text-indigo-600 hover:border-indigo-300 hover:text-indigo-700 transition">
                      <span>Super Admin</span>
                      <svg className="ml-1 h-3 w-3 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                    
                    {/* Dropdown Menu */}
                    <div className="absolute left-0 top-full pt-1 w-56 bg-white rounded-lg shadow-lg border border-gray-200 z-10 hidden group-hover:block">
                      <div className="py-1">
                        <Link
                          href="/super-admin/overview"
                          className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                        >
                          System Overview
                        </Link>
                        <Link
                          href="/super-admin/companies"
                          className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                        >
                          All Companies
                        </Link>
                        <Link
                          href="/super-admin/monitoring"
                          className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                        >
                          System Monitoring
                        </Link>
                        <Link
                          href="/super-admin/users"
                          className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                        >
                          All Users
                        </Link>
                        <div className="border-t border-gray-200 my-1" />
                        <div className="px-4 py-2 text-xs text-gray-500">
                          Super Admin Tools
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
            
              {/* User Menu */}
            <div className="flex items-center gap-3">
              {isSuperAdmin && !impersonating && (
                <CompanySwitcher
                  currentCompanyId={effectiveUser.companyId}
                  currentCompanyName={null}
                  isSuperAdmin={true}
                />
              )}
              
              <div className="flex-shrink-0">
                <span className="text-xs text-gray-700 mr-4">
                  {effectiveUser?.name || 'User'} ({effectiveUser?.superAdmin ? 'super admin' : effectiveUser?.role || 'user'})
                </span>
              </div>
              <UserButton afterSignOutUrl="/" />
            </div>
          </div>
        </div>
      </nav>
      
      {/* Main Content */}
      <main className="py-6">
        {children}
      </main>
    </div>
  )
}
