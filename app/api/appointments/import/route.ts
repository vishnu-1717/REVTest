import { NextRequest, NextResponse } from 'next/server'
import { withPrisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const { companyId, appointments } = await request.json()
    
    if (!companyId || !Array.isArray(appointments)) {
      return NextResponse.json(
        { error: 'Invalid request: companyId and appointments array required' },
        { status: 400 }
      )
    }
    
    const result = await withPrisma(async (prisma) => {
      const results = []
      
      for (const apt of appointments) {
        try {
          // Find or create contact
          let contact = await prisma.contact.findFirst({
            where: {
              companyId,
              OR: [
                { email: apt.Email },
                { phone: apt.Phone }
              ]
            }
          })
          
          if (!contact) {
            contact = await prisma.contact.create({
              data: {
                name: apt['Contact Name'] || apt.Email || apt.Phone,
                email: apt.Email,
                phone: apt.Phone,
                companyId,
                customFields: {
                  originalSource: 'csv_import'
                }
              }
            })
          }
          
          // Find or create closer
          let closer = await prisma.user.findFirst({
            where: {
              companyId,
              email: apt.Closer
            }
          })
          
          if (!closer) {
            closer = await prisma.user.create({
              data: {
                name: apt.Closer.split('@')[0],
                email: apt.Closer,
                role: 'closer',
                companyId
              }
            })
          }
          
          // Map status
          const statusMap: Record<string, string> = {
            'Signed': 'signed',
            'Showed': 'showed',
            'No-showed': 'no_show',
            'Cancelled': 'cancelled'
          }
          
          // Create appointment
          const appointment = await prisma.appointment.create({
            data: {
              ghlAppointmentId: apt['Appointment ID'],
              scheduledAt: new Date(apt.Date),
              startTime: apt['Appointment Start Time'] ? new Date(apt['Appointment Start Time']) : null,
              companyId,
              contactId: contact.id,
              closerId: closer.id,
              calendar: apt.Calendar,
              status: statusMap[apt['Call Outcome']] || 'scheduled',
              outcome: apt['Call Outcome'],
              isFirstCall: apt['First Call or Follow Up'] === 'First Call',
              objectionType: apt['Why Didnt the Prospect Move Forward?'],
              objectionNotes: apt.Notes,
              qualificationStatus: apt['Qualifiation Status'],
              followUpScheduled: apt['Follow Up Scheduled'] === 'Yes',
              nurtureType: apt['Nurture Type'],
              cashCollected: apt['Cash Collected'] ? parseFloat(apt['Cash Collected']) : null,
              customFields: {
                signedNotes: apt['Signed Notes'],
                cancellationReason: apt['Cancellation Reason'],
                fathomNotes: apt['Fathom Notes']
              }
            }
          })
          
          results.push({ success: true, appointmentId: appointment.id })
          
        } catch (error: any) {
          results.push({
            success: false,
            error: error.message,
            appointment: apt['Appointment ID']
          })
        }
      }
      
      return {
        success: true,
        imported: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length,
        results
      }
    })
    
    return NextResponse.json(result)
    
  } catch (error: any) {
    console.error('Import error:', error)
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    )
  }
}

