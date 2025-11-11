import { NextRequest, NextResponse } from 'next/server'
import { getEffectiveUser } from '@/lib/auth'
import { withPrisma } from '@/lib/db'
import { getEffectiveCompanyId } from '@/lib/company-context'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const currentUser = await getEffectiveUser()
    
    if (!currentUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    if (currentUser.role !== 'admin' && !currentUser.superAdmin) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }
    
    const { id } = await params
    const effectiveCompanyId = await getEffectiveCompanyId(request.url)

    if (!currentUser.superAdmin && currentUser.companyId !== effectiveCompanyId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    
    const user = await withPrisma(async (prisma) => {
      return await prisma.user.findFirst({
        where: {
          id,
          companyId: effectiveCompanyId
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
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const currentUser = await getEffectiveUser()
    
    if (!currentUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    if (currentUser.role !== 'admin' && !currentUser.superAdmin) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }
    
    const { id } = await params
    const effectiveCompanyId = await getEffectiveCompanyId(request.url)

    if (!currentUser.superAdmin && currentUser.companyId !== effectiveCompanyId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { name, role, commissionRoleId, customCommissionRate, canViewTeamMetrics, isActive, ghlUserId } = await request.json()
    
    const user = await withPrisma(async (prisma) => {
      if (ghlUserId !== undefined && ghlUserId !== null && ghlUserId !== '') {
        const existingUser = await prisma.user.findFirst({
          where: {
            companyId: effectiveCompanyId,
            ghlUserId: ghlUserId,
            NOT: { id }
          }
        })
        
        if (existingUser) {
          throw new Error('GHL User ID is already assigned to another user in this company')
        }
      }
      
      return await prisma.user.update({
        where: {
          id,
          companyId: effectiveCompanyId
        },
        data: {
          name,
          role,
          commissionRoleId: commissionRoleId || null,
          customCommissionRate: customCommissionRate ? parseFloat(customCommissionRate) / 100 : null,
          canViewTeamMetrics,
          isActive,
          ...(ghlUserId !== undefined && { ghlUserId: ghlUserId || null })
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
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const currentUser = await getEffectiveUser()
    
    if (!currentUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    if (currentUser.role !== 'admin' && !currentUser.superAdmin) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }
    
    const { id } = await params
    const effectiveCompanyId = await getEffectiveCompanyId(request.url)

    if (!currentUser.superAdmin && currentUser.companyId !== effectiveCompanyId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { name, email, role, commissionRoleId, customCommissionRate, canViewTeamMetrics, isActive, ghlUserId } = await request.json()
    
    const updatedUser = await withPrisma(async (prisma) => {
      const existing = await prisma.user.findFirst({
        where: {
          id,
          companyId: effectiveCompanyId
        }
      })
      
      if (!existing) {
        throw new Error('User not found')
      }
      
      if (email && email !== existing.email) {
        const emailExists = await prisma.user.findFirst({
          where: {
            email,
            companyId: effectiveCompanyId
          }
        })
        
        if (emailExists) {
          throw new Error('User with this email already exists')
        }
      }
      
      if (ghlUserId !== undefined && ghlUserId !== null && ghlUserId !== '' && ghlUserId !== existing.ghlUserId) {
        const existingUser = await prisma.user.findFirst({
          where: {
            companyId: effectiveCompanyId,
            ghlUserId: ghlUserId,
            NOT: { id }
          }
        })
        
        if (existingUser) {
          throw new Error('GHL User ID is already assigned to another user in this company')
        }
      }
      
      return await prisma.user.update({
        where: {
          id,
          companyId: effectiveCompanyId
        },
        data: {
          ...(name && { name }),
          ...(email && { email }),
          ...(role && { role }),
          ...(commissionRoleId !== undefined && { commissionRoleId: commissionRoleId || null }),
          ...(customCommissionRate !== undefined && { customCommissionRate: customCommissionRate ? parseFloat(customCommissionRate) / 100 : null }),
          ...(canViewTeamMetrics !== undefined && { canViewTeamMetrics }),
          ...(isActive !== undefined && { isActive }),
          ...(ghlUserId !== undefined && { ghlUserId: ghlUserId || null })
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
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const currentUser = await getEffectiveUser()
    
    if (!currentUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    const isImpersonating = (currentUser as any)._impersonating === true
    
    if (currentUser.role !== 'admin' && !currentUser.superAdmin) {
      return NextResponse.json({ 
        error: 'Admin access required',
        details: isImpersonating 
          ? 'You are currently impersonating a user who is not an admin. Please exit impersonation to delete users.'
          : 'You need admin or super admin access to delete users.'
      }, { status: 403 })
    }
    
    const { id } = await params
    const effectiveCompanyId = await getEffectiveCompanyId(request.url)

    if (!currentUser.superAdmin && currentUser.companyId !== effectiveCompanyId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    
    if (id === currentUser.id) {
      return NextResponse.json(
        { error: 'Cannot delete your own account' },
        { status: 400 }
      )
    }
    
    const result = await withPrisma(async (prisma) => {
      const user = await prisma.user.findFirst({
        where: {
          id,
          companyId: effectiveCompanyId
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
        await prisma.user.update({
          where: { id },
          data: { isActive: false }
        })
        
        return { deactivated: true, hasData: true }
      }
      
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
