type DateRangeInput = {
  dateFrom?: string | null
  dateTo?: string | null
  timezone: string
}

function pad(value: number, length = 2): string {
  return value.toString().padStart(length, '0')
}

function getTimeZoneOffset(date: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })

  const parts = dtf.formatToParts(date)
  const componentMap: Record<string, string> = {}
  parts.forEach(({ type, value }) => {
    componentMap[type] = value
  })

  const adjustedTime = Date.UTC(
    Number(componentMap.year),
    Number(componentMap.month) - 1,
    Number(componentMap.day),
    Number(componentMap.hour),
    Number(componentMap.minute),
    Number(componentMap.second),
  )

  return adjustedTime - date.getTime()
}

export function convertLocalDateTimeToUtc(date: Date, timeZone: string): Date {
  if (!timeZone || timeZone.toLowerCase() === 'utc') {
    return new Date(date.getTime())
  }

  const offset = getTimeZoneOffset(date, timeZone)
  return new Date(date.getTime() - offset)
}

export function localDateTimeStringToUtc(dateTime: string, timeZone: string): Date {
  const normalized = dateTime.replace(' ', 'T')
  const [datePart, timePart = '00:00:00.000'] = normalized.split('T')
  const [year, month, day] = datePart.split('-').map(Number)

  const timeSegments = timePart.split(':')
  const hour = Number(timeSegments[0] || 0)
  const minute = Number(timeSegments[1] || 0)
  const secondSegments = (timeSegments[2] || '0').split('.')
  const second = Number(secondSegments[0] || 0)
  const millisecond = Number((secondSegments[1] || '0').padEnd(3, '0').slice(0, 3))

  const base = new Date(Date.UTC(year, (month || 1) - 1, day || 1, hour, minute, second, millisecond))
  return convertLocalDateTimeToUtc(base, timeZone)
}

export function convertDateToUtc(date: Date, timeZone: string): Date {
  const localIso = `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}T${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}.${pad(date.getUTCMilliseconds(), 3)}`
  return localDateTimeStringToUtc(localIso, timeZone)
}

export function convertDateRangeToUtc({ dateFrom, dateTo, timezone }: DateRangeInput): { start: Date | null; end: Date | null } {
  const start = dateFrom ? localDateTimeStringToUtc(`${dateFrom}T00:00:00.000`, timezone) : null
  const end = dateTo ? localDateTimeStringToUtc(`${dateTo}T23:59:59.999`, timezone) : null
  return { start, end }
}

export function getCompanyTimezone(company?: { timezone?: string | null } | null): string {
  return company?.timezone || 'UTC'
}

