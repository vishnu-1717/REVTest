import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { withPrisma } from '@/lib/db'
import { cookies } from 'next/headers'

export async function POST(request: Request) {
  try {
    const currentUser = await requireAdmin()
    
    const { userId } = await request.json()
    
    console.log('Impersonate API - Current user:', {
      id: currentUser.id,
      name: currentUser.name,
      companyId: currentUser.companyId,
      superAdmin: currentUser.superAdmin
    })
    console.log('Impersonate API - Target userId:', userId)
    
    if (!userId) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 })
    }
    
    // Check if the target user exists
    const targetUser = await withPrisma(async (prisma) => {
      return await prisma.user.findUnique({
        where: { id: userId },
        include: { Company: true }
      })
    })
    
    if (!targetUser) {
      console.log('Impersonate API - Target user not found:', userId)
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }
    
    console.log('Impersonate API - Target user found:', {
      id: targetUser.id,
      name: targetUser.name,
      email: targetUser.email,
      companyId: targetUser.companyId,
      companyName: targetUser.Company?.name
    })
    
    // Check permissions
    // Super admin can impersonate anyone
    // Company admin can only impersonate users in their company
    if (!currentUser.superAdmin && targetUser.companyId !== currentUser.companyId) {
      console.log('Impersonate API - Permission denied:', {
        currentUserCompanyId: currentUser.companyId,
        targetUserCompanyId: targetUser.companyId
      })
      return NextResponse.json({ error: 'Unauthorized to impersonate this user' }, { status: 403 })
    }
    
    // Set impersonation cookie
    const cookieStore = await cookies()
    cookieStore.set('impersonated_user_id', userId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 // 24 hours
    })
    
    // Store the actual user ID for reference
    cookieStore.set('original_user_id', currentUser.id, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 // 24 hours
    })
    
    return NextResponse.json({ 
      success: true,
      impersonatedUser: {
        id: targetUser.id,
        name: targetUser.name,
        email: targetUser.email,
        role: targetUser.role,
        companyName: targetUser.Company?.name
      }
    })
    
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

