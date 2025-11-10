import { NextResponse } from 'next/server'
import { withPrisma } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import { SUPER_ADMIN_EMAILS } from '@/lib/constants'

// Endpoint to force update superAdmin flag for current user if email matches
export async function POST() {
  try {
    const user = await getCurrentUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!SUPER_ADMIN_EMAILS.includes(user.email)) {
      return NextResponse.json({
        error: 'This endpoint is only for authorized super admin emails',
        yourEmail: user.email
      }, { status: 403 })
    }
    
    const result = await withPrisma(async (prisma) => {
      const updatedUser = await prisma.user.update({
        where: { id: user.id },
        data: { 
          superAdmin: true,
          role: 'admin'
        },
        include: {
          Company: true,
          commissionRole: true
        }
      })
      
      return {
        id: updatedUser.id,
        email: updatedUser.email,
        name: updatedUser.name,
        role: updatedUser.role,
        superAdmin: updatedUser.superAdmin,
        companyId: updatedUser.companyId
      }
    })
    
    return NextResponse.json({
      success: true,
      message: 'Super admin flag updated successfully',
      user: result
    })
    
  } catch (error: any) {
    console.error('Error updating super admin:', error)
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    )
  }
}

