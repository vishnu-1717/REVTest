import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { withPrisma } from '@/lib/db'

export async function PUT(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireAdmin()
    const { name, defaultRate, description } = await request.json()
    
    const role = await withPrisma(async (prisma) => {
      return await prisma.commissionRole.update({
        where: {
          id: params.id,
          companyId: user.companyId
        },
        data: {
          name,
          defaultRate: parseFloat(defaultRate),
          description
        }
      })
    })
    
    return NextResponse.json(role)
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireAdmin()
    
    const result = await withPrisma(async (prisma) => {
      // Check if role has users
      const role = await prisma.commissionRole.findUnique({
        where: {
          id: params.id,
          companyId: user.companyId
        },
        include: {
          _count: {
            select: { users: true }
          }
        }
      })
      
      if (!role) {
        throw new Error('Role not found')
      }
      
      if (role._count.users > 0) {
        throw new Error(`Cannot delete role with ${role._count.users} assigned users`)
      }
      
      await prisma.commissionRole.delete({
        where: { id: params.id }
      })
      
      return { success: true }
    })
    
    return NextResponse.json(result)
  } catch (error: any) {
    if (error.message.includes('not found')) {
      return NextResponse.json({ error: error.message }, { status: 404 })
    }
    if (error.message.includes('Cannot delete')) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
