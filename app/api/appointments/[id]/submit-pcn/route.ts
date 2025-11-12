import { NextRequest, NextResponse } from 'next/server'
import { getEffectiveUser } from '@/lib/auth'
import { PCNSubmission } from '@/types/pcn'
import { submitPCN, validatePCNSubmission } from '@/lib/pcn-submission'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getEffectiveUser()
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params

    const body: PCNSubmission = await request.json()
    const validationError = validatePCNSubmission(body)
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 })
    }

    const result = await submitPCN({
      appointmentId: id,
      companyId: user.companyId,
      submission: body,
      actorUserId: user.id,
      actorName: user.name || null
    })

    return NextResponse.json({ success: true, ...result })
  } catch (error: any) {
    console.error('[API] Error submitting PCN:', error)
    return NextResponse.json(
      { error: 'Failed to submit PCN', details: error.message },
      { status: 500 }
    )
  }
}

