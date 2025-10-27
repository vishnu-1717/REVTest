import { getCurrentUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { UserButton } from '@clerk/nextjs'
import CompanySwitcher from '@/components/CompanySwitcher'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await getCurrentUser()
  
  if (!user) {
    redirect('/sign-in')
  }
  
  const isAdmin = user?.role === 'admin' || user?.superAdmin
  const isSuperAdmin = user?.superAdmin
  
  // Get company name if available
  let currentCompanyName: string | null = null
  if (isSuperAdmin && user.companyId) {
    // This will be filled in client-side by CompanySwitcher
    currentCompanyName = null
  }
  
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top Navigation */}
      <nav className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex">
              {/* Logo */}
              <div className="flex-shrink-0 flex items-center">
                <Link href="/dashboard" className="text-xl font-bold">
                  PayMaestro
                </Link>
              </div>
              
              {/* Navigation Links */}
              <div className="hidden sm:ml-6 sm:flex sm:space-x-8">
                <Link
                  href="/dashboard"
                  className="inline-flex items-center px-1 pt-1 text-sm font-medium text-gray-900 border-b-2 border-transparent hover:border-gray-300"
                >
                  Dashboard
                </Link>
                
                <Link
                  href="/analytics"
                  className="inline-flex items-center px-1 pt-1 text-sm font-medium text-gray-900 border-b-2 border-transparent hover:border-gray-300"
                >
                  Analytics
                </Link>
                
                <Link
                  href="/commissions"
                  className="inline-flex items-center px-1 pt-1 text-sm font-medium text-gray-900 border-b-2 border-transparent hover:border-gray-300"
                >
                  Commissions
                </Link>
                
                {isAdmin && (
                  <>
                    <Link
                      href="/admin/users"
                      className="inline-flex items-center px-1 pt-1 text-sm font-medium text-gray-900 border-b-2 border-transparent hover:border-gray-300"
                    >
                      Users
                    </Link>
                    
                    <Link
                      href="/admin/roles"
                      className="inline-flex items-center px-1 pt-1 text-sm font-medium text-gray-900 border-b-2 border-transparent hover:border-gray-300"
                    >
                      Roles
                    </Link>
                    
                    <Link
                      href="/admin/payments"
                      className="inline-flex items-center px-1 pt-1 text-sm font-medium text-gray-900 border-b-2 border-transparent hover:border-gray-300"
                    >
                      Payments
                    </Link>
                  </>
                )}
                
                {isSuperAdmin && (
                  <div className="relative group">
                    <button className="inline-flex items-center px-1 pt-1 text-sm font-medium text-gray-900 border-b-2 border-transparent hover:border-gray-300">
                      <span className="text-purple-600">Super Admin</span>
                      <svg className="ml-1 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                    
                    {/* Dropdown Menu */}
                    <div className="absolute left-0 mt-2 w-56 bg-white rounded-md shadow-lg border z-10 hidden group-hover:block">
                      <div className="py-1">
                        <Link
                          href="/super-admin/overview"
                          className="block px-4 py-2 text-sm text-gray-700 hover:bg-purple-50"
                        >
                          System Overview
                        </Link>
                        <Link
                          href="/super-admin/companies"
                          className="block px-4 py-2 text-sm text-gray-700 hover:bg-purple-50"
                        >
                          All Companies
                        </Link>
                        <Link
                          href="/super-admin/monitoring"
                          className="block px-4 py-2 text-sm text-gray-700 hover:bg-purple-50"
                        >
                          System Monitoring
                        </Link>
                        <Link
                          href="/super-admin/users"
                          className="block px-4 py-2 text-sm text-gray-700 hover:bg-purple-50"
                        >
                          All Users
                        </Link>
                        <div className="border-t my-1" />
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
              {isSuperAdmin && (
                <CompanySwitcher
                  currentCompanyId={user.companyId}
                  currentCompanyName={null}
                  isSuperAdmin={true}
                />
              )}
              
              <div className="flex-shrink-0">
                <span className="text-sm text-gray-700 mr-4">
                  {user?.name || 'User'} ({user?.superAdmin ? 'super admin' : user?.role || 'user'})
                </span>
              </div>
              <UserButton afterSignOutUrl="/" />
            </div>
          </div>
        </div>
      </nav>
      
      {/* Main Content */}
      <main className="py-10">
        {children}
      </main>
    </div>
  )
}
