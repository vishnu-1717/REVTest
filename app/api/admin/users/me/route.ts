import { NextResponse } from 'next/server'
import { getEffectiveUser } from '@/lib/auth'

export async function GET() {
  try {
    const user = await getEffectiveUser()
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    return NextResponse.json({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      superAdmin: user.superAdmin,
      companyId: user.companyId,
      isImpersonating: (user as any)._impersonating === true
    })
  } catch (error: any) {
    console.error('Error fetching current user:', error)
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    )
  }
}

