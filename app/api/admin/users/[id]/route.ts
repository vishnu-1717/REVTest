import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { withPrisma } from '@/lib/db'

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireAdmin()
    const { name, email, role, commissionRoleId, customCommissionRate, canViewTeamMetrics, isActive } = await request.json()
    
    const updatedUser = await withPrisma(async (prisma) => {
      // Check if user belongs to the same company
      const existing = await prisma.user.findFirst({
        where: {
          id: params.id,
          companyId: user.companyId
        }
      })
      
      if (!existing) {
        throw new Error('User not found')
      }
      
      // If email is being changed, check if new email is already taken
      if (email && email !== existing.email) {
        const emailExists = await prisma.user.findFirst({
          where: {
            email,
            companyId: user.companyId
          }
        })
        
        if (emailExists) {
          throw new Error('User with this email already exists')
        }
      }
      
      return await prisma.user.update({
        where: {
          id: params.id
        },
        data: {
          ...(name && { name }),
          ...(email && { email }),
          ...(role && { role }),
          ...(commissionRoleId !== undefined && { commissionRoleId: commissionRoleId || null }),
          ...(customCommissionRate !== undefined && { customCommissionRate: customCommissionRate ? parseFloat(customCommissionRate) / 100 : null }),
          ...(canViewTeamMetrics !== undefined && { canViewTeamMetrics }),
          ...(isActive !== undefined && { isActive })
        },
        include: {
          commissionRole: true
        }
      })
    })
    
    return NextResponse.json(updatedUser)
  } catch (error: any) {
    if (error.message.includes('not found') || error.message.includes('already exists')) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireAdmin()
    
    await withPrisma(async (prisma) => {
      // Check if user belongs to the same company
      const existing = await prisma.user.findFirst({
        where: {
          id: params.id,
          companyId: user.companyId
        }
      })
      
      if (!existing) {
        throw new Error('User not found')
      }
      
      // Don't allow deleting yourself - check by email since user.id is clerkId
      if (existing.email === user.email) {
        throw new Error('Cannot delete your own account')
      }
      
      // Soft delete by setting isActive to false
      // In a production system, you might want to actually delete
      await prisma.user.update({
        where: {
          id: params.id
        },
        data: {
          isActive: false
        }
      })
    })
    
    return NextResponse.json({ message: 'User deactivated successfully' })
  } catch (error: any) {
    if (error.message.includes('not found') || error.message.includes('your own')) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
