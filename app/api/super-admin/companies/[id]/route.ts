import { NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/auth'
import { withPrisma } from '@/lib/db'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireSuperAdmin()
    const { id } = await params
    
    const company = await withPrisma(async (prisma) => {
      return await prisma.company.findUnique({
        where: { id },
        include: {
          User: {
            include: {
              commissionRole: true,
              _count: {
                select: {
                  AppointmentsAsCloser: true,
                  Commission: true
                }
              }
            }
          },
          CommissionRole: true,
          _count: {
            select: {
              Appointment: true,
              Sale: true,
              Commission: true
            }
          }
        }
      })
    })
    
    if (!company) {
      return NextResponse.json(
        { error: 'Company not found' },
        { status: 404 }
      )
    }
    
    return NextResponse.json(company)
  } catch (error: any) {
    console.error('Error fetching company:', error)
    return NextResponse.json(
      { error: error.message },
      { status: 401 }
    )
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireSuperAdmin()
    const { id } = await params
    
    const result = await withPrisma(async (prisma) => {
      // Check if company exists and get count of related data
      const company = await prisma.company.findUnique({
        where: { id },
        include: {
          _count: {
            select: {
              User: true,
              Appointment: true,
              Sale: true,
              Commission: true
            }
          }
        }
      })
      
      if (!company) {
        throw new Error('Company not found')
      }
      
      // Warn if company has significant data
      if (company._count.User > 0 || company._count.Appointment > 0) {
        // For now, we'll still allow deletion but log a warning
        // In production, you might want to require confirmation or soft delete
        console.warn(`Deleting company ${id} with ${company._count.User} users, ${company._count.Appointment} appointments`)
      }
      
      // Delete the company (cascade will handle related records based on schema)
      await prisma.company.delete({
        where: { id }
      })
      
      return { deleted: true }
    })
    
    return NextResponse.json({ 
      success: true,
      message: 'Company deleted successfully'
    })
  } catch (error: any) {
    console.error('Error deleting company:', error)
    if (error.message.includes('not found')) {
      return NextResponse.json({ error: error.message }, { status: 404 })
    }
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    )
  }
}

