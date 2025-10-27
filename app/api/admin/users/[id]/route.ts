import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { withPrisma } from '@/lib/db'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const currentUser = await requireAdmin()
    const { id } = await params
    
    const user = await withPrisma(async (prisma) => {
      return await prisma.user.findFirst({
        where: {
          id,
          companyId: currentUser.companyId
        },
        include: {
          commissionRole: true,
          Commission: {
            include: {
              Sale: true
            },
            orderBy: {
              calculatedAt: 'desc'
            },
            take: 10
          },
          AppointmentsAsCloser: {
            include: {
              contact: true
            },
            orderBy: {
              scheduledAt: 'desc'
            },
            take: 10
          }
        }
      })
    })
    
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }
    
    return NextResponse.json(user)
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const currentUser = await requireAdmin()
    const { id } = await params
    const { name, role, commissionRoleId, customCommissionRate, canViewTeamMetrics } = await request.json()
    
    const user = await withPrisma(async (prisma) => {
      return await prisma.user.update({
        where: {
          id,
          companyId: currentUser.companyId
        },
        data: {
          name,
          role,
          commissionRoleId: commissionRoleId || null,
          customCommissionRate: customCommissionRate ? parseFloat(customCommissionRate) / 100 : null,
          canViewTeamMetrics
        },
        include: {
          commissionRole: true
        }
      })
    })
    
    return NextResponse.json(user)
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAdmin()
    const { id } = await params
    const { name, email, role, commissionRoleId, customCommissionRate, canViewTeamMetrics } = await request.json()
    
    const updatedUser = await withPrisma(async (prisma) => {
      // Check if user belongs to the same company
      const existing = await prisma.user.findFirst({
        where: {
          id,
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
          id
        },
        data: {
          ...(name && { name }),
          ...(email && { email }),
          ...(role && { role }),
          ...(commissionRoleId !== undefined && { commissionRoleId: commissionRoleId || null }),
          ...(customCommissionRate !== undefined && { customCommissionRate: customCommissionRate ? parseFloat(customCommissionRate) / 100 : null }),
          ...(canViewTeamMetrics !== undefined && { canViewTeamMetrics })
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
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const currentUser = await requireAdmin()
    const { id } = await params
    
    // Don't allow deleting yourself
    if (id === currentUser.id) {
      return NextResponse.json(
        { error: 'Cannot delete your own account' },
        { status: 400 }
      )
    }
    
    const result = await withPrisma(async (prisma) => {
      // Check if user belongs to the same company
      const user = await prisma.user.findFirst({
        where: {
          id,
          companyId: currentUser.companyId
        },
        include: {
          _count: {
            select: {
              Commission: true,
              AppointmentsAsCloser: true
            }
          }
        }
      })
      
      if (!user) {
        throw new Error('User not found')
      }
      
      if (user._count.Commission > 0 || user._count.AppointmentsAsCloser > 0) {
        // Instead of deleting, just don't delete (keep the user)
        // In production, you might want to add a deletedAt timestamp field
        return { deactivated: true, hasData: true }
      }
      
      // If no data, can safely delete
      await prisma.user.delete({
        where: { id }
      })
      
      return { deleted: true, hasData: false }
    })
    
    if (result.deactivated) {
      return NextResponse.json({
        success: true,
        message: 'User deactivated (has historical data)'
      })
    }
    
    return NextResponse.json({ success: true })
  } catch (error: any) {
    if (error.message.includes('not found')) {
      return NextResponse.json({ error: error.message }, { status: 404 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
