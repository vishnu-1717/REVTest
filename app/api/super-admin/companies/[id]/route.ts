import { NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/auth'
import { withPrisma } from '@/lib/db'

const isValidTimezone = (timezone: string): boolean => {
  try {
    new Intl.DateTimeFormat(undefined, { timeZone: timezone })
    return true
  } catch {
    return false
  }
}

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

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireSuperAdmin()
    const { id } = await params
    const body = await request.json()
    const requestedTimezone =
      typeof body.timezone === 'string' && body.timezone.trim().length > 0
        ? body.timezone.trim()
        : ''

    if (!requestedTimezone) {
      return NextResponse.json({ error: 'Timezone is required' }, { status: 400 })
    }

    if (!isValidTimezone(requestedTimezone)) {
      return NextResponse.json({ error: 'Invalid timezone provided' }, { status: 400 })
    }

    const updatedCompany = await withPrisma(async (prisma) => {
      const existing = await prisma.company.findUnique({ where: { id } })

      if (!existing) {
        throw new Error('Company not found')
      }

      return prisma.company.update({
        where: { id },
        data: { timezone: requestedTimezone },
        select: {
          id: true,
          name: true,
          timezone: true
        }
      })
    })

    return NextResponse.json({ company: updatedCompany })
  } catch (error: any) {
    console.error('Error updating company timezone:', error)
    if (error?.message === 'Company not found') {
      return NextResponse.json({ error: error.message }, { status: 404 })
    }
    return NextResponse.json(
      { error: error?.message || 'Failed to update company' },
      { status: 400 }
    )
  }
}

