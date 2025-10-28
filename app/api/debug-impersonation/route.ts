import { NextResponse } from 'next/server'
import { getEffectiveUser, getCurrentUser, getImpersonatedUser } from '@/lib/auth'
import { cookies } from 'next/headers'

export async function GET() {
  try {
    const cookieStore = await cookies()
    const impersonatedUserId = cookieStore.get('impersonated_user_id')?.value
    const originalUserId = cookieStore.get('original_user_id')?.value
    
    console.log('Debug endpoint: All cookies received:', cookieStore.getAll())
    console.log('Debug endpoint: impersonated_user_id:', impersonatedUserId)
    console.log('Debug endpoint: original_user_id:', originalUserId)
    
    const currentUser = await getCurrentUser()
    const impersonatedUser = await getImpersonatedUser()
    const effectiveUser = await getEffectiveUser()
    
    return NextResponse.json({
      cookies: {
        impersonatedUserId,
        originalUserId
      },
      currentUser: currentUser ? {
        id: currentUser.id,
        name: currentUser.name,
        email: currentUser.email,
        companyId: currentUser.companyId,
        role: currentUser.role,
        superAdmin: currentUser.superAdmin
      } : null,
      impersonatedUser: impersonatedUser ? {
        id: impersonatedUser.id,
        name: impersonatedUser.name,
        email: impersonatedUser.email,
        companyId: impersonatedUser.companyId,
        role: impersonatedUser.role,
        superAdmin: impersonatedUser.superAdmin
      } : null,
      effectiveUser: effectiveUser ? {
        id: effectiveUser.id,
        name: effectiveUser.name,
        email: effectiveUser.email,
        companyId: effectiveUser.companyId,
        role: effectiveUser.role,
        superAdmin: effectiveUser.superAdmin,
        isImpersonating: (effectiveUser as any)._impersonating || false
      } : null
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
