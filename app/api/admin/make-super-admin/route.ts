import { NextResponse } from 'next/server'
import { withPrisma } from '@/lib/db'
import { MAKE_SUPER_ADMIN_ALLOWED_EMAILS } from '@/lib/constants'

// This is a temporary endpoint to grant super admin access
export async function POST(request: Request) {
  try {
    const { email } = await request.json()

    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 })
    }

    // Only allow specific email for security
    if (!MAKE_SUPER_ADMIN_ALLOWED_EMAILS.includes(email)) {
      return NextResponse.json({ error: 'Email not authorized' }, { status: 403 })
    }
    
    const user = await withPrisma(async (prisma) => {
      return await prisma.user.updateMany({
        where: { email },
        data: {
          superAdmin: true,
          role: 'admin'
        }
      })
    })
    
    return NextResponse.json({ 
      success: true, 
      message: `Granted super admin access to ${email}`,
      updated: user.count
    })
    
  } catch (error: any) {
    console.error('Error making super admin:', error)
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    )
  }
}
