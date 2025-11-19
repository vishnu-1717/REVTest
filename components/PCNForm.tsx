'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { PCNSubmission, PCNAppointmentData, PCN_OPTIONS } from '@/types/pcn'
import { useToast } from '@/components/ui/use-toast'
import { format } from 'date-fns'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'

interface PCNFormProps {
  appointment: PCNAppointmentData
}

type Step = 
  | 'outcome'
  | 'showed_details'
  | 'signed_details'
  | 'no_show_details'
  | 'cancelled_details'
  | 'disqualified_details'

export function PCNForm({ appointment }: PCNFormProps) {
  const router = useRouter()
  const { toast } = useToast()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [currentStep, setCurrentStep] = useState<Step>('outcome')
  
  // Form state
  const [callOutcome, setCallOutcome] = useState<string>(appointment.outcome || '')
  const [firstCallOrFollowUp, setFirstCallOrFollowUp] = useState(appointment.firstCallOrFollowUp || '')
  const [wasOfferMade, setWasOfferMade] = useState<string>(appointment.wasOfferMade === true ? 'yes' : appointment.wasOfferMade === false ? 'no' : '')
  const [whyDidntMoveForward, setWhyDidntMoveForward] = useState(appointment.whyDidntMoveForward || '')
  const [notMovingForwardNotes, setNotMovingForwardNotes] = useState(appointment.notMovingForwardNotes || '')
  const [qualificationStatus, setQualificationStatus] = useState(appointment.qualificationStatus || '')
  const [disqualificationReason, setDisqualificationReason] = useState(appointment.disqualificationReason || '')
  const [followUpScheduled, setFollowUpScheduled] = useState<string>(appointment.followUpScheduled ? 'yes' : appointment.followUpScheduled === false ? 'no' : '')
  const [nurtureType, setNurtureType] = useState(appointment.nurtureType || '')
  const [signedNotes, setSignedNotes] = useState(appointment.signedNotes || '')
  const [cashCollected, setCashCollected] = useState<number | string>(appointment.cashCollected || '')
  const [noShowCommunicative, setNoShowCommunicative] = useState<string>(
    appointment.noShowCommunicative === true ? 'communicative_up_to_call' : 
    appointment.noShowCommunicative === false ? 'not_communicative' : ''
  )
  const [noShowCommunicativeNotes, setNoShowCommunicativeNotes] = useState(appointment.noShowCommunicativeNotes || '')
  const [cancellationReason, setCancellationReason] = useState(appointment.cancellationReason || '')
  const [cancellationNotes, setCancellationNotes] = useState(appointment.cancellationNotes || '')
  const [clientPhone, setClientPhone] = useState(appointment.contactPhone || '')

  // Determine next step based on current step and selections
  const getNextStep = (): Step | null => {
    if (currentStep === 'outcome') {
      if (callOutcome === 'showed') return 'showed_details'
      if (callOutcome === 'signed') return 'signed_details'
      if (callOutcome === 'no_show') return 'no_show_details'
      if (callOutcome === 'cancelled') return 'cancelled_details'
      if (callOutcome === 'contract_sent') return 'showed_details' // Contract sent follows showed flow
      return null
    }
    
    if (currentStep === 'showed_details') {
      if (qualificationStatus === 'disqualified') return 'disqualified_details'
      return null // Ready to submit
    }
    
    return null // Ready to submit
  }

  const getPrevStep = (): Step | null => {
    if (currentStep === 'showed_details' || currentStep === 'signed_details' || 
        currentStep === 'no_show_details' || currentStep === 'cancelled_details') {
      return 'outcome'
    }
    if (currentStep === 'disqualified_details') {
      return 'showed_details'
    }
    return null
  }

  const canProceed = (): boolean => {
    if (currentStep === 'outcome') {
      if (!callOutcome) return false
      // First Call or Follow Up is only required for showed/contract_sent
      if ((callOutcome === 'showed' || callOutcome === 'contract_sent') && !firstCallOrFollowUp) {
        return false
      }
      return true
    }
    
    if (currentStep === 'showed_details') {
      if (!wasOfferMade) return false
      if (wasOfferMade === 'yes' && !whyDidntMoveForward) return false
      if (!qualificationStatus) return false
      if (qualificationStatus === 'disqualified' && !disqualificationReason) return false
      if (!followUpScheduled) return false
      if (followUpScheduled === 'yes' && !nurtureType) return false
      return true
    }
    
    if (currentStep === 'signed_details') {
      if (!cashCollected || Number(cashCollected) <= 0) return false
      if (!signedNotes) return false
      if (!wasOfferMade) return false
      return true
    }
    
    if (currentStep === 'no_show_details') {
      if (!noShowCommunicative) return false
      return true
    }
    
    if (currentStep === 'cancelled_details') {
      if (!cancellationReason) return false
      return true
    }
    
    if (currentStep === 'disqualified_details') {
      if (!disqualificationReason) return false
      return true
    }
    
    return false
  }

  const handleNext = () => {
    const next = getNextStep()
    if (next) {
      setCurrentStep(next)
    } else {
      handleSubmit()
    }
  }

  const handlePrev = () => {
    const prev = getPrevStep()
    if (prev) {
      setCurrentStep(prev)
    }
  }

  const handleSubmit = async () => {
    setIsSubmitting(true)

    try {
      const submission: PCNSubmission = {
        callOutcome: callOutcome as any,
        notes: notMovingForwardNotes || cancellationNotes || noShowCommunicativeNotes || signedNotes || ''
      }

      // Add fields based on outcome
      if (callOutcome === 'showed' || callOutcome === 'contract_sent') {
        submission.firstCallOrFollowUp = firstCallOrFollowUp as any
        submission.wasOfferMade = wasOfferMade === 'yes'
        submission.whyDidntMoveForward = whyDidntMoveForward || undefined
        submission.notMovingForwardNotes = notMovingForwardNotes || undefined
        submission.followUpScheduled = followUpScheduled === 'yes'
        submission.nurtureType = nurtureType as any
        submission.qualificationStatus = qualificationStatus as any
        submission.disqualificationReason = disqualificationReason || undefined
      }

      if (callOutcome === 'signed') {
        submission.signedNotes = signedNotes
        submission.cashCollected = Number(cashCollected)
        submission.wasOfferMade = wasOfferMade === 'yes'
      }

      if (callOutcome === 'no_show') {
        // Map the display values back to boolean
        // Any value other than "not_communicative" means communicative
        submission.noShowCommunicative = noShowCommunicative !== 'not_communicative'
        submission.noShowCommunicativeNotes = noShowCommunicativeNotes || undefined
      }

      if (callOutcome === 'cancelled') {
        submission.cancellationReason = cancellationReason
        submission.cancellationNotes = cancellationNotes || undefined
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

  const renderStep = () => {
    switch (currentStep) {
      case 'outcome':
        return (
          <div className="space-y-6">
            <div>
              <Label className="text-base font-medium mb-3 block">
                Client Phone (copy paste into here) <span className="text-red-500">*</span>
              </Label>
              <Input
                value={clientPhone}
                onChange={(e) => setClientPhone(e.target.value)}
                placeholder="Phone"
                className="w-full"
              />
            </div>

            <div>
              <Label className="text-base font-medium mb-3 block">
                PCN - Appointment ID <span className="text-red-500">*</span>
              </Label>
              <Input
                value={appointment.id}
                disabled
                className="w-full bg-gray-50"
              />
            </div>

            <div className="border-2 border-blue-500 rounded-lg p-4 bg-blue-50/30">
              <div className="flex items-center justify-between mb-3">
                <Label className="text-base font-medium">
                  Call Outcome <span className="text-red-500">*</span>
                </Label>
              </div>
              <Select value={callOutcome} onValueChange={setCallOutcome}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select outcome..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="signed">Signed</SelectItem>
                  <SelectItem value="contract_sent">Contract Sent</SelectItem>
                  <SelectItem value="showed">Showed</SelectItem>
                  <SelectItem value="no_show">No-showed</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {(callOutcome === 'showed' || callOutcome === 'contract_sent') && (
              <div>
                <Label className="text-base font-medium mb-3 block">
                  First Call or Follow Up? <span className="text-red-500">*</span>
                </Label>
                <Select value={firstCallOrFollowUp} onValueChange={setFirstCallOrFollowUp}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="first_call">First Call</SelectItem>
                    <SelectItem value="follow_up">Follow Up</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        )

      case 'showed_details':
        return (
          <div className="space-y-6">
            <div className="border-2 border-blue-500 rounded-lg p-4 bg-blue-50/30">
              <div className="flex items-center justify-between mb-3">
                <Label className="text-base font-medium">
                  Did you make an offer? <span className="text-red-500">*</span>
                </Label>
              </div>
              <Select value={wasOfferMade} onValueChange={setWasOfferMade}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="yes">Yes</SelectItem>
                  <SelectItem value="no">No</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {wasOfferMade === 'yes' && (
              <>
                <div className="border-2 border-blue-500 rounded-lg p-4 bg-blue-50/30">
                  <div className="flex items-center justify-between mb-3">
                    <Label className="text-base font-medium">
                      Why didn't the prospect move forward? <span className="text-red-500">*</span>
                    </Label>
                  </div>
                  <Select value={whyDidntMoveForward} onValueChange={setWhyDidntMoveForward}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select reason..." />
                    </SelectTrigger>
                    <SelectContent>
                      {PCN_OPTIONS.whyDidntMoveForward.map(option => (
                        <SelectItem key={option} value={option}>{option}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-base font-medium mb-3 block">
                    Call notes. Be thorough: what was there buying criteria, what was the objection, what are next steps... <span className="text-red-500">*</span>
                  </Label>
                  <Textarea
                    value={notMovingForwardNotes}
                    onChange={(e) => setNotMovingForwardNotes(e.target.value)}
                    rows={6}
                    className="w-full"
                    placeholder="Enter detailed notes..."
                  />
                </div>
              </>
            )}

            <div className="border-2 border-blue-500 rounded-lg p-4 bg-blue-50/30">
              <div className="flex items-center justify-between mb-3">
                <Label className="text-base font-medium">
                  What is the Prospect's Qualification Status? <span className="text-red-500">*</span>
                </Label>
              </div>
              <Select value={qualificationStatus} onValueChange={setQualificationStatus}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select status..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="qualified">Qualified to purchase</SelectItem>
                  <SelectItem value="disqualified">Disqualified</SelectItem>
                  <SelectItem value="pending">Downsell Opportunity</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="border-2 border-blue-500 rounded-lg p-4 bg-blue-50/30">
              <div className="flex items-center justify-between mb-3">
                <Label className="text-base font-medium">
                  Was a follow up scheduled? <span className="text-red-500">*</span>
                </Label>
              </div>
              <Select value={followUpScheduled} onValueChange={setFollowUpScheduled}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="yes">Yes</SelectItem>
                  <SelectItem value="no">No</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {followUpScheduled === 'yes' && (
              <div className="border-2 border-blue-500 rounded-lg p-4 bg-blue-50/30">
                <div className="flex items-center justify-between mb-3">
                  <Label className="text-base font-medium">
                    When is this expected to close? <span className="text-red-500">*</span>
                  </Label>
                </div>
                <Select value={nurtureType} onValueChange={setNurtureType}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select nurture type..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="redzone">Redzone (Within 7 Days)</SelectItem>
                    <SelectItem value="short_term">Short Term Nurture (7-30 days)</SelectItem>
                    <SelectItem value="long_term">Long Term Nurture (30+ days)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        )

      case 'signed_details':
        return (
          <div className="space-y-6">
            <div>
              <Label className="text-base font-medium mb-3 block">
                PCN - Cash Collected <span className="text-red-500">*</span>
              </Label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-gray-500">$</span>
                <Input
                  type="number"
                  value={cashCollected}
                  onChange={(e) => setCashCollected(e.target.value)}
                  required
                  min="0"
                  step="0.01"
                  className="w-full pl-8"
                  placeholder="0.00"
                />
              </div>
            </div>

            <div>
              <Label className="text-base font-medium mb-3 block">
                Signed Notes <span className="text-red-500">*</span>
              </Label>
              <Textarea
                value={signedNotes}
                onChange={(e) => setSignedNotes(e.target.value)}
                rows={4}
                className="w-full"
                placeholder="Enter notes about the close..."
              />
            </div>

            <div className="border-2 border-blue-500 rounded-lg p-4 bg-blue-50/30">
              <div className="flex items-center justify-between mb-3">
                <Label className="text-base font-medium">
                  Did you make an offer? <span className="text-red-500">*</span>
                </Label>
              </div>
              <Select value={wasOfferMade} onValueChange={setWasOfferMade}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="yes">Yes</SelectItem>
                  <SelectItem value="no">No</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        )

      case 'no_show_details':
        return (
          <div className="space-y-6">
            <div className="border-2 border-blue-500 rounded-lg p-4 bg-blue-50/30">
              <div className="flex items-center justify-between mb-3">
                <Label className="text-base font-medium">
                  Was the no show communicative? <span className="text-red-500">*</span>
                </Label>
              </div>
              <Select value={noShowCommunicative} onValueChange={setNoShowCommunicative}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="communicative_up_to_call">Communicative up to the call</SelectItem>
                  <SelectItem value="communicative_rescheduled">Communicative, rescheduled</SelectItem>
                  <SelectItem value="not_communicative">Not communicative</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-base font-medium mb-3 block">
                *Optional* Did anything contribute to a no show?
              </Label>
              <Textarea
                value={noShowCommunicativeNotes}
                onChange={(e) => setNoShowCommunicativeNotes(e.target.value)}
                rows={4}
                className="w-full"
                placeholder="Enter optional notes..."
              />
            </div>
          </div>
        )

      case 'cancelled_details':
        return (
          <div className="space-y-6">
            <div className="border-2 border-blue-500 rounded-lg p-4 bg-blue-50/30">
              <div className="flex items-center justify-between mb-3">
                <Label className="text-base font-medium">
                  Cancellation Reason <span className="text-red-500">*</span>
                </Label>
              </div>
              <Select value={cancellationReason} onValueChange={setCancellationReason}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select reason..." />
                </SelectTrigger>
                <SelectContent>
                  {PCN_OPTIONS.cancellationReasons.map(option => (
                    <SelectItem key={option} value={option}>{option}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-base font-medium mb-3 block">
                Notes <span className="text-red-500">*</span>
              </Label>
              <Textarea
                value={cancellationNotes}
                onChange={(e) => setCancellationNotes(e.target.value)}
                rows={4}
                className="w-full"
                placeholder="Enter cancellation notes..."
              />
            </div>
          </div>
        )

      case 'disqualified_details':
        return (
          <div className="space-y-6">
            <div className="border-2 border-blue-500 rounded-lg p-4 bg-blue-50/30">
              <div className="flex items-center justify-between mb-3">
                <Label className="text-base font-medium">
                  DQ Reason <span className="text-red-500">*</span>
                </Label>
              </div>
              <Select value={disqualificationReason} onValueChange={setDisqualificationReason}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select reason..." />
                </SelectTrigger>
                <SelectContent>
                  {PCN_OPTIONS.disqualificationReasons.map(option => (
                    <SelectItem key={option} value={option}>{option}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-base font-medium mb-3 block">
                DQ Notes <span className="text-red-500">*</span>
              </Label>
              <Textarea
                value={notMovingForwardNotes}
                onChange={(e) => setNotMovingForwardNotes(e.target.value)}
                rows={4}
                className="w-full"
                placeholder="Enter disqualification notes..."
              />
            </div>
          </div>
        )

      default:
        return null
    }
  }

  const getStepTitle = (): string => {
    switch (currentStep) {
      case 'outcome': return 'Call Outcome'
      case 'showed_details': return 'Showed'
      case 'signed_details': return 'Signed'
      case 'no_show_details': return 'No Show'
      case 'cancelled_details': return 'Cancelled'
      case 'disqualified_details': return 'Disqualified'
      default: return 'Post-Call Notes'
    }
  }

  return (
    <div className="space-y-6">
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

      {/* Step Title */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">{getStepTitle()}</h2>
      </div>

      {/* Step Content */}
      <Card>
        <CardContent className="p-6">
          {renderStep()}
        </CardContent>
      </Card>

      {/* Navigation Footer */}
      <div className="bg-blue-600 text-white rounded-lg p-4 flex items-center justify-between">
        <Button
          type="button"
          onClick={handlePrev}
          disabled={!getPrevStep() || isSubmitting}
          variant="ghost"
          className="text-white hover:bg-blue-700 disabled:opacity-50"
        >
          ← PREV
        </Button>
        <Button
          type="button"
          onClick={handleNext}
          disabled={!canProceed() || isSubmitting}
          className="bg-white text-blue-600 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {getNextStep() ? 'NEXT →' : isSubmitting ? 'Submitting...' : 'Submit'}
        </Button>
      </div>
    </div>
  )
}
