'use client'

import { useRouter } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

interface PCNStatusProps {
  appointmentId: string
  pcnSubmitted: boolean
  pcnSubmittedAt: string | null
  scheduledAt: string
  status: string
  showButton?: boolean
}

export function PCNStatus({
  appointmentId,
  pcnSubmitted,
  pcnSubmittedAt,
  scheduledAt,
  status,
  showButton = true
}: PCNStatusProps) {
  const router = useRouter()

  // Check if PCN is overdue (more than 4 hours since scheduled)
  const scheduledTime = new Date(scheduledAt).getTime()
  const now = Date.now()
  const hoursSince = (now - scheduledTime) / (1000 * 60 * 60)
  const isOverdue = !pcnSubmitted && status !== 'cancelled' && hoursSince > 4

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    router.push(`/pcn/${appointmentId}`)
  }

  if (pcnSubmitted) {
    return (
      <div className="flex items-center gap-2">
        <Badge className="bg-green-500 text-white">✅ Submitted</Badge>
        {showButton && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleClick}
            className="text-xs"
          >
            Edit
          </Button>
        )}
      </div>
    )
  }

  if (status === 'cancelled') {
    return (
      <Badge variant="outline" className="text-gray-500">
        Not Required
      </Badge>
    )
  }

  if (isOverdue) {
    return (
      <div className="flex items-center gap-2">
        <Badge className="bg-red-500 text-white">🔴 Overdue!</Badge>
        {showButton && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleClick}
            className="text-xs border-red-500 text-red-600 hover:bg-red-50"
          >
            Submit
          </Button>
        )}
      </div>
    )
  }

  // Check if approaching deadline (2-4 hours since scheduled)
  const isUrgent = hoursSince > 2 && hoursSince <= 4

  return (
    <div className="flex items-center gap-2">
      <Badge className={isUrgent ? 'bg-yellow-500 text-white' : 'bg-blue-500 text-white'}>
        {isUrgent ? '⚠️ Needs Attention' : '📝 Pending'}
      </Badge>
      {showButton && (
        <Button
          variant="outline"
          size="sm"
          onClick={handleClick}
          className="text-xs"
        >
          Submit
        </Button>
      )}
    </div>
  )
}

