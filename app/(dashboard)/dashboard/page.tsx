import { getEffectiveUser } from '@/lib/auth'
import DashboardClient from './dashboard-client'

export default async function DashboardPage() {
  const user = await getEffectiveUser()
  
  if (!user) {
    return <div>Unauthorized</div>
  }
  
  // Determine if user is a company admin (admin role or super admin)
  const isCompanyAdmin = user.role === 'admin' || user.superAdmin
  const isSuperAdmin = user.superAdmin
  
  return (
    <DashboardClient 
      userRole={user.role} 
      isCompanyAdmin={isCompanyAdmin}
      isSuperAdmin={isSuperAdmin}
    />
  )
}
