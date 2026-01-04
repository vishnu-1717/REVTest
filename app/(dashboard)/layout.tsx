import { getCurrentUser, getEffectiveUser, isImpersonating, getImpersonatedUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { UserButton } from '@clerk/nextjs'
import CompanySwitcher from '@/components/CompanySwitcher'
import ImpersonationBanner from '@/components/ImpersonationBanner'
import NavLink from '@/components/NavLink'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel
} from '@/components/ui/dropdown-menu'
import { ChevronDown, Shield, LayoutDashboard, BarChart3, Calculator, Trophy, MessageSquare, Settings, Users, CreditCard, Calendar, Share2, Eye } from 'lucide-react'

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
              <div className="hidden sm:ml-8 sm:flex sm:items-center sm:space-x-1">
                <NavLink href="/dashboard">
                  <LayoutDashboard className="w-4 h-4 mr-1.5 opacity-60" />
                  Dashboard
                </NavLink>

                <NavLink href="/analytics">
                  <BarChart3 className="w-4 h-4 mr-1.5 opacity-60" />
                  Analytics
                </NavLink>

                <NavLink href="/commissions">
                  <Calculator className="w-4 h-4 mr-1.5 opacity-60" />
                  Commissions
                </NavLink>

                <NavLink href="/leaderboard">
                  <Trophy className="w-4 h-4 mr-1.5 opacity-60" />
                  Leaderboard
                </NavLink>

                <NavLink href="/ai-chat">
                  <MessageSquare className="w-4 h-4 mr-1.5 opacity-60" />
                  AI Chat
                </NavLink>

                {isAdmin && (
                  <DropdownMenu>
                    <DropdownMenuTrigger className="flex items-center text-xs px-3 py-2 rounded-md font-medium text-gray-600 hover:bg-gray-100/80 hover:text-gray-900 transition-all outline-none">
                      <Settings className="w-4 h-4 mr-1.5 opacity-60" />
                      Admin
                      <ChevronDown className="ml-1 h-3 w-3 opacity-40 group-data-[state=open]:rotate-180 transition-transform" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-56 mt-1">
                      <DropdownMenuLabel className="text-[10px] font-bold uppercase tracking-wider text-gray-400 px-3 py-2">
                        Management
                      </DropdownMenuLabel>
                      <Link href="/admin/users">
                        <DropdownMenuItem className="cursor-pointer px-3 py-2">
                          <Users className="w-4 h-4 mr-2 opacity-60" />
                          <span>Users</span>
                        </DropdownMenuItem>
                      </Link>
                      <Link href="/admin/roles">
                        <DropdownMenuItem className="cursor-pointer px-3 py-2">
                          <Shield className="w-4 h-4 mr-2 opacity-60" />
                          <span>Commission Roles</span>
                        </DropdownMenuItem>
                      </Link>
                      <Link href="/admin/payments">
                        <DropdownMenuItem className="cursor-pointer px-3 py-2">
                          <CreditCard className="w-4 h-4 mr-2 opacity-60" />
                          <span>Payments</span>
                        </DropdownMenuItem>
                      </Link>
                      <Link href="/admin/calendars">
                        <DropdownMenuItem className="cursor-pointer px-3 py-2">
                          <Calendar className="w-4 h-4 mr-2 opacity-60" />
                          <span>Calendars</span>
                        </DropdownMenuItem>
                      </Link>
                      <DropdownMenuSeparator />
                      <DropdownMenuLabel className="text-[10px] font-bold uppercase tracking-wider text-gray-400 px-3 py-2">
                        System
                      </DropdownMenuLabel>
                      <Link href="/admin/integrations">
                        <DropdownMenuItem className="cursor-pointer px-3 py-2">
                          <Share2 className="w-4 h-4 mr-2 opacity-60" />
                          <span>Integrations</span>
                        </DropdownMenuItem>
                      </Link>
                      <Link href="/admin/pcn-qa">
                        <DropdownMenuItem className="cursor-pointer px-3 py-2">
                          <Eye className="w-4 h-4 mr-2 opacity-60" />
                          <span>PCN QA</span>
                        </DropdownMenuItem>
                      </Link>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}

                {isSuperAdmin && (
                  <DropdownMenu>
                    <DropdownMenuTrigger className="flex items-center text-xs px-3 py-2 rounded-md font-medium text-indigo-600 hover:bg-indigo-50/50 hover:text-indigo-700 transition-all outline-none">
                      <Shield className="w-4 h-4 mr-1.5 opacity-80" />
                      Super Admin
                      <ChevronDown className="ml-1 h-3 w-3 opacity-40 group-data-[state=open]:rotate-180 transition-transform" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-56 mt-1">
                      <DropdownMenuLabel className="text-[10px] font-bold uppercase tracking-wider text-indigo-400 px-3 py-2">
                        Platform Control
                      </DropdownMenuLabel>
                      <Link href="/super-admin/overview">
                        <DropdownMenuItem className="cursor-pointer px-3 py-2">
                          <LayoutDashboard className="w-4 h-4 mr-2 text-indigo-500 opacity-70" />
                          <span>System Overview</span>
                        </DropdownMenuItem>
                      </Link>
                      <Link href="/super-admin/companies">
                        <DropdownMenuItem className="cursor-pointer px-3 py-2">
                          <Users className="w-4 h-4 mr-2 text-indigo-500 opacity-70" />
                          <span>All Companies</span>
                        </DropdownMenuItem>
                      </Link>
                      <Link href="/super-admin/monitoring">
                        <DropdownMenuItem className="cursor-pointer px-3 py-2">
                          <BarChart3 className="w-4 h-4 mr-2 text-indigo-500 opacity-70" />
                          <span>System Monitoring</span>
                        </DropdownMenuItem>
                      </Link>
                      <Link href="/super-admin/users">
                        <DropdownMenuItem className="cursor-pointer px-3 py-2">
                          <Users className="w-4 h-4 mr-2 text-indigo-500 opacity-70" />
                          <span>All Users</span>
                        </DropdownMenuItem>
                      </Link>
                    </DropdownMenuContent>
                  </DropdownMenu>
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
