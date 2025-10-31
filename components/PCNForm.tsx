'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { PCNSubmission, PCNAppointmentData, PCN_OPTIONS } from '@/types/pcn'
import { useToast } from '@/components/ui/use-toast'
import { format } from 'date-fns'

interface PCNFormProps {
  appointment: PCNAppointmentData
}

export function PCNForm({ appointment }: PCNFormProps) {
  const router = useRouter()
  const { toast } = useToast()
  const [isSubmitting, setIsSubmitting] = useState(false)
  
  // Form state
  const [callOutcome, setCallOutcome] = useState<string>(appointment.outcome || '')
  const [firstCallOrFollowUp, setFirstCallOrFollowUp] = useState(appointment.firstCallOrFollowUp || '')
  const [wasOfferMade, setWasOfferMade] = useState<boolean | null>(appointment.wasOfferMade)
  const [whyDidntMoveForward, setWhyDidntMoveForward] = useState(appointment.whyDidntMoveForward || '')
  const [notMovingForwardNotes, setNotMovingForwardNotes] = useState(appointment.notMovingForwardNotes || '')
  const [objectionType, setObjectionType] = useState(appointment.objectionType || '')
  const [objectionNotes, setObjectionNotes] = useState(appointment.objectionNotes || '')
  const [followUpScheduled, setFollowUpScheduled] = useState(appointment.followUpScheduled)
  const [followUpDate, setFollowUpDate] = useState(appointment.followUpDate || '')
  const [nurtureType, setNurtureType] = useState(appointment.nurtureType || '')
  const [qualificationStatus, setQualificationStatus] = useState(appointment.qualificationStatus || '')
  const [disqualificationReason, setDisqualificationReason] = useState(appointment.disqualificationReason || '')
  const [signedNotes, setSignedNotes] = useState(appointment.signedNotes || '')
  const [cashCollected, setCashCollected] = useState<number | string>(appointment.cashCollected || '')
  const [noShowCommunicative, setNoShowCommunicative] = useState<boolean | null>(appointment.noShowCommunicative)
  const [noShowCommunicativeNotes, setNoShowCommunicativeNotes] = useState(appointment.noShowCommunicativeNotes || '')
  const [cancellationReason, setCancellationReason] = useState(appointment.cancellationReason || '')
  const [cancellationNotes, setCancellationNotes] = useState(appointment.cancellationNotes || '')
  const [notes, setNotes] = useState(appointment.notes || '')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)

    try {
      const submission: PCNSubmission = {
        callOutcome: callOutcome as any,
        notes
      }

      // Add fields based on outcome
      if (callOutcome === 'showed') {
        submission.firstCallOrFollowUp = firstCallOrFollowUp as any
        submission.wasOfferMade = wasOfferMade ?? undefined
        submission.whyDidntMoveForward = whyDidntMoveForward
        submission.notMovingForwardNotes = notMovingForwardNotes
        submission.objectionType = objectionType
        submission.objectionNotes = objectionNotes
        submission.followUpScheduled = followUpScheduled
        submission.followUpDate = followUpDate
        submission.nurtureType = nurtureType as any
        submission.qualificationStatus = qualificationStatus as any
        submission.disqualificationReason = disqualificationReason
      }

      if (callOutcome === 'signed') {
        submission.signedNotes = signedNotes
        submission.cashCollected = Number(cashCollected)
      }

      if (callOutcome === 'no_show') {
        submission.noShowCommunicative = noShowCommunicative ?? undefined
        submission.noShowCommunicativeNotes = noShowCommunicativeNotes
      }

      if (callOutcome === 'cancelled') {
        submission.cancellationReason = cancellationReason
        submission.cancellationNotes = cancellationNotes
      }

      const response = await fetch(`/api/appointments/${appointment.id}/submit-pcn`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(submission)
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to submit PCN')
      }

      toast({
        title: 'Success!',
        description: 'Post call notes submitted successfully.'
      })

      // Redirect to dashboard after 1 second
      setTimeout(() => {
        router.push('/dashboard')
        router.refresh()
      }, 1000)

    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to submit PCN'
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Appointment Info Header */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h3 className="font-semibold text-lg mb-2">Appointment Details</h3>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-gray-600">Contact:</span>{' '}
            <span className="font-medium">{appointment.contactName}</span>
          </div>
          <div>
            <span className="text-gray-600">Scheduled:</span>{' '}
            <span className="font-medium">
              {format(new Date(appointment.scheduledAt), 'MMM d, yyyy h:mm a')}
            </span>
          </div>
          {appointment.closerName && (
            <div>
              <span className="text-gray-600">Closer:</span>{' '}
              <span className="font-medium">{appointment.closerName}</span>
            </div>
          )}
          {appointment.calendarName && (
            <div>
              <span className="text-gray-600">Calendar:</span>{' '}
              <span className="font-medium">{appointment.calendarName}</span>
            </div>
          )}
        </div>
      </div>

      {/* Call Outcome Selection */}
      <div>
        <label className="block text-sm font-medium mb-2">
          Call Outcome <span className="text-red-500">*</span>
        </label>
        <select
          value={callOutcome}
          onChange={(e) => setCallOutcome(e.target.value)}
          required
          className="w-full border rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        >
          <option value="">Select outcome...</option>
          <option value="showed">Showed</option>
          <option value="signed">Signed</option>
          <option value="contract_sent">Contract Sent</option>
          <option value="no_show">No-Show</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>

      {/* SHOWED OUTCOME FIELDS */}
      {callOutcome === 'showed' && (
        <div className="space-y-4 bg-gray-50 p-4 rounded-lg border">
          <h4 className="font-semibold">Call Details</h4>
          
          {/* First Call or Follow Up */}
          <div>
            <label className="block text-sm font-medium mb-2">
              First Call or Follow-Up? <span className="text-red-500">*</span>
            </label>
            <select
              value={firstCallOrFollowUp}
              onChange={(e) => setFirstCallOrFollowUp(e.target.value)}
              required
              className="w-full border rounded-lg px-4 py-2"
            >
              <option value="">Select...</option>
              <option value="first_call">First Call</option>
              <option value="follow_up">Follow-Up</option>
            </select>
          </div>

          {/* Was Offer Made */}
          <div>
            <label className="block text-sm font-medium mb-2">
              Did you make an offer? <span className="text-red-500">*</span>
            </label>
            <div className="flex gap-4">
              <label className="flex items-center">
                <input
                  type="radio"
                  checked={wasOfferMade === true}
                  onChange={() => setWasOfferMade(true)}
                  required
                  className="mr-2"
                />
                Yes
              </label>
              <label className="flex items-center">
                <input
                  type="radio"
                  checked={wasOfferMade === false}
                  onChange={() => setWasOfferMade(false)}
                  required
                  className="mr-2"
                />
                No
              </label>
            </div>
          </div>

          {/* If Offer Made - Why Didn't Move Forward */}
          {wasOfferMade && (
            <>
              <div>
                <label className="block text-sm font-medium mb-2">
                  Why didn't the prospect move forward? <span className="text-red-500">*</span>
                </label>
                <select
                  value={whyDidntMoveForward}
                  onChange={(e) => setWhyDidntMoveForward(e.target.value)}
                  required
                  className="w-full border rounded-lg px-4 py-2"
                >
                  <option value="">Select reason...</option>
                  {PCN_OPTIONS.whyDidntMoveForward.map(option => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">
                  Additional Notes
                </label>
                <textarea
                  value={notMovingForwardNotes}
                  onChange={(e) => setNotMovingForwardNotes(e.target.value)}
                  rows={3}
                  className="w-full border rounded-lg px-4 py-2"
                  placeholder="Any additional details..."
                />
              </div>

              {/* Objection Type */}
              <div>
                <label className="block text-sm font-medium mb-2">
                  Objection Type
                </label>
                <select
                  value={objectionType}
                  onChange={(e) => setObjectionType(e.target.value)}
                  className="w-full border rounded-lg px-4 py-2"
                >
                  <option value="">Select objection type...</option>
                  {PCN_OPTIONS.objectionTypes.map(option => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </div>

              {objectionType && (
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Objection Notes
                  </label>
                  <textarea
                    value={objectionNotes}
                    onChange={(e) => setObjectionNotes(e.target.value)}
                    rows={2}
                    className="w-full border rounded-lg px-4 py-2"
                    placeholder="Describe the objection..."
                  />
                </div>
              )}
            </>
          )}

          {/* Follow-Up Scheduled */}
          <div>
            <label className="block text-sm font-medium mb-2">
              Was a follow-up scheduled?
            </label>
            <div className="flex gap-4">
              <label className="flex items-center">
                <input
                  type="radio"
                  checked={followUpScheduled === true}
                  onChange={() => setFollowUpScheduled(true)}
                  className="mr-2"
                />
                Yes
              </label>
              <label className="flex items-center">
                <input
                  type="radio"
                  checked={followUpScheduled === false}
                  onChange={() => setFollowUpScheduled(false)}
                  className="mr-2"
                />
                No
              </label>
            </div>
          </div>

          {/* If Follow-Up Scheduled */}
          {followUpScheduled && (
            <>
              <div>
                <label className="block text-sm font-medium mb-2">
                  Follow-Up Date <span className="text-red-500">*</span>
                </label>
                <input
                  type="datetime-local"
                  value={followUpDate}
                  onChange={(e) => setFollowUpDate(e.target.value)}
                  required
                  className="w-full border rounded-lg px-4 py-2"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">
                  Nurture Type <span className="text-red-500">*</span>
                </label>
                <select
                  value={nurtureType}
                  onChange={(e) => setNurtureType(e.target.value)}
                  required
                  className="w-full border rounded-lg px-4 py-2"
                >
                  <option value="">Select nurture type...</option>
                  {PCN_OPTIONS.nurtureTypes.map(option => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </div>
            </>
          )}

          {/* Qualification Status */}
          <div>
            <label className="block text-sm font-medium mb-2">
              Qualification Status
            </label>
            <select
              value={qualificationStatus}
              onChange={(e) => setQualificationStatus(e.target.value)}
              className="w-full border rounded-lg px-4 py-2"
            >
              <option value="">Select status...</option>
              <option value="qualified">Qualified</option>
              <option value="disqualified">Disqualified</option>
              <option value="pending">Pending</option>
            </select>
          </div>

          {qualificationStatus === 'disqualified' && (
            <div>
              <label className="block text-sm font-medium mb-2">
                Disqualification Reason
              </label>
              <select
                value={disqualificationReason}
                onChange={(e) => setDisqualificationReason(e.target.value)}
                className="w-full border rounded-lg px-4 py-2"
              >
                <option value="">Select reason...</option>
                {PCN_OPTIONS.disqualificationReasons.map(option => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}

      {/* SIGNED OUTCOME FIELDS */}
      {callOutcome === 'signed' && (
        <div className="space-y-4 bg-green-50 p-4 rounded-lg border border-green-200">
          <h4 className="font-semibold text-green-900">Signed! 🎉</h4>
          
          <div>
            <label className="block text-sm font-medium mb-2">
              Cash Collected <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <span className="absolute left-3 top-2 text-gray-500">$</span>
              <input
                type="number"
                value={cashCollected}
                onChange={(e) => setCashCollected(e.target.value)}
                required
                min="0"
                step="0.01"
                className="w-full border rounded-lg pl-8 pr-4 py-2"
                placeholder="5000.00"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">
              Signed Notes
            </label>
            <textarea
              value={signedNotes}
              onChange={(e) => setSignedNotes(e.target.value)}
              rows={3}
              className="w-full border rounded-lg px-4 py-2"
              placeholder="Notes about the close..."
            />
          </div>
        </div>
      )}

      {/* NO-SHOW OUTCOME FIELDS */}
      {callOutcome === 'no_show' && (
        <div className="space-y-4 bg-red-50 p-4 rounded-lg border border-red-200">
          <h4 className="font-semibold text-red-900">No-Show Details</h4>
          
          <div>
            <label className="block text-sm font-medium mb-2">
              Was the no-show communicative? <span className="text-red-500">*</span>
            </label>
            <div className="flex gap-4">
              <label className="flex items-center">
                <input
                  type="radio"
                  checked={noShowCommunicative === true}
                  onChange={() => setNoShowCommunicative(true)}
                  required
                  className="mr-2"
                />
                Yes
              </label>
              <label className="flex items-center">
                <input
                  type="radio"
                  checked={noShowCommunicative === false}
                  onChange={() => setNoShowCommunicative(false)}
                  required
                  className="mr-2"
                />
                No
              </label>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">
              Communication Notes
            </label>
            <textarea
              value={noShowCommunicativeNotes}
              onChange={(e) => setNoShowCommunicativeNotes(e.target.value)}
              rows={3}
              className="w-full border rounded-lg px-4 py-2"
              placeholder="Details about communication..."
            />
          </div>
        </div>
      )}

      {/* CANCELLED OUTCOME FIELDS */}
      {callOutcome === 'cancelled' && (
        <div className="space-y-4 bg-gray-50 p-4 rounded-lg border">
          <h4 className="font-semibold">Cancellation Details</h4>
          
          <div>
            <label className="block text-sm font-medium mb-2">
              Cancellation Reason <span className="text-red-500">*</span>
            </label>
            <select
              value={cancellationReason}
              onChange={(e) => setCancellationReason(e.target.value)}
              required
              className="w-full border rounded-lg px-4 py-2"
            >
              <option value="">Select reason...</option>
              {PCN_OPTIONS.cancellationReasons.map(option => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">
              Cancellation Notes
            </label>
            <textarea
              value={cancellationNotes}
              onChange={(e) => setCancellationNotes(e.target.value)}
              rows={3}
              className="w-full border rounded-lg px-4 py-2"
              placeholder="Additional details..."
            />
          </div>
        </div>
      )}

      {/* General Notes (Always Shown) */}
      <div>
        <label className="block text-sm font-medium mb-2">
          General Notes
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          className="w-full border rounded-lg px-4 py-2"
          placeholder="Any additional notes about this call..."
        />
      </div>

      {/* Submit Button */}
      <div className="flex gap-4 pt-4 border-t">
        <button
          type="button"
          onClick={() => router.back()}
          className="flex-1 px-6 py-3 border border-gray-300 rounded-lg hover:bg-gray-50"
          disabled={isSubmitting}
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isSubmitting || !callOutcome}
          className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSubmitting ? 'Submitting...' : 'Submit PCN'}
        </button>
      </div>
    </form>
  )
}

