import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Formats minutes into a human-readable string with days, hours, and minutes
 * Examples:
 * - 600 minutes -> "10 hours"
 * - 602 minutes -> "10 hours and 2 minutes"
 * - 1440 minutes -> "1 day"
 * - 1502 minutes -> "1 day, 1 hour and 2 minutes"
 */
export function formatMinutesOverdue(minutes: number): string {
  if (minutes < 60) {
    return `${minutes} minute${minutes !== 1 ? 's' : ''}`
  }

  const days = Math.floor(minutes / 1440)
  const hours = Math.floor((minutes % 1440) / 60)
  const mins = minutes % 60

  const parts: string[] = []

  if (days > 0) {
    parts.push(`${days} day${days !== 1 ? 's' : ''}`)
  }

  if (hours > 0) {
    parts.push(`${hours} hour${hours !== 1 ? 's' : ''}`)
  }

  if (mins > 0 && days === 0) {
    // Only show minutes if there are no days (to avoid too much detail)
    parts.push(`${mins} minute${mins !== 1 ? 's' : ''}`)
  }

  if (parts.length === 0) {
    return '0 minutes'
  }

  if (parts.length === 1) {
    return parts[0]
  }

  if (parts.length === 2) {
    return parts.join(' and ')
  }

  // For 3 parts (days, hours, minutes), format as "X days, Y hours and Z minutes"
  return parts.slice(0, -1).join(', ') + ' and ' + parts[parts.length - 1]
}
