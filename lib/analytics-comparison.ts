export type ComparisonTarget =
  | 'overall'
  | 'previous_period'
  | 'all_other_days'
  | 'weekdays'
  | 'weekends'

const MS_IN_DAY = 1000 * 60 * 60 * 24

const formatDate = (date: Date): string => {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

const parseDate = (value?: string | null): Date | null => {
  if (!value) return null
  const [year, month, day] = value.split('-').map((part) => parseInt(part, 10))
  if (!year || !month || !day) return null
  return new Date(year, month - 1, day)
}

export const getComparisonLabel = (target: ComparisonTarget): string => {
  switch (target) {
    case 'previous_period':
      return 'Previous Period'
    case 'all_other_days':
      return 'All Other Days'
    case 'weekdays':
      return 'Weekdays'
    case 'weekends':
      return 'Weekends'
    case 'overall':
    default:
      return 'All Data (Same Range)'
  }
}

const derivePreviousPeriodDates = (
  dateFrom?: string | null,
  dateTo?: string | null
): { dateFrom?: string; dateTo?: string } | null => {
  const fromDate = parseDate(dateFrom)
  const toDate = parseDate(dateTo)
  if (!fromDate || !toDate) {
    return null
  }

  const start = fromDate <= toDate ? fromDate : toDate
  const end = fromDate <= toDate ? toDate : fromDate
  const diffDays = Math.max(0, Math.round((end.getTime() - start.getTime()) / MS_IN_DAY))

  const previousEnd = new Date(start)
  previousEnd.setDate(previousEnd.getDate() - 1)

  const previousStart = new Date(previousEnd)
  previousStart.setDate(previousStart.getDate() - diffDays)

  return {
    dateFrom: formatDate(previousStart),
    dateTo: formatDate(previousEnd)
  }
}

export const buildComparisonParams = (
  baseParams: URLSearchParams,
  target: ComparisonTarget,
  activeDayOfWeek?: string | null
): URLSearchParams => {
  const params = new URLSearchParams(baseParams.toString())
  params.delete('compareWith')
  params.delete('detail')
  params.delete('detailLimit')

  switch (target) {
    case 'previous_period': {
      const previous = derivePreviousPeriodDates(params.get('dateFrom'), params.get('dateTo'))
      if (previous) {
        if (previous.dateFrom) {
          params.set('dateFrom', previous.dateFrom)
        }
        if (previous.dateTo) {
          params.set('dateTo', previous.dateTo)
        }
      }
      break
    }
    case 'all_other_days': {
      if (activeDayOfWeek) {
        const values = params.getAll('dayOfWeek')
        params.delete('dayOfWeek')
        values
          .filter((val) => val !== activeDayOfWeek)
          .forEach((val) => params.append('excludeDayOfWeek', val))
        params.append('excludeDayOfWeek', activeDayOfWeek)
      }
      break
    }
    case 'weekdays': {
      params.delete('dayOfWeek')
      params.delete('excludeDayOfWeek')
      ;['1', '2', '3', '4', '5'].forEach((dow) => params.append('dayOfWeek', dow))
      break
    }
    case 'weekends': {
      params.delete('dayOfWeek')
      params.delete('excludeDayOfWeek')
      params.append('dayOfWeek', '0')
      params.append('dayOfWeek', '6')
      break
    }
    case 'overall':
    default: {
      params.delete('dayOfWeek')
      params.delete('excludeDayOfWeek')
      params.delete('timeOfDay')
    }
  }

  return params
}

export const transformFiltersForComparison = <T extends { dateFrom?: string; dateTo?: string; dayOfWeek?: any; timeOfDay?: any; excludeDayOfWeek?: any }>(
  filters: T,
  target: ComparisonTarget,
  activeDayOfWeek?: string | null
): T => {
  const next: T = { ...filters }
  switch (target) {
    case 'previous_period': {
      const previous = derivePreviousPeriodDates(filters.dateFrom, filters.dateTo)
      if (previous?.dateFrom && previous?.dateTo) {
        next.dateFrom = previous.dateFrom as T['dateFrom']
        next.dateTo = previous.dateTo as T['dateTo']
      }
      break
    }
    case 'all_other_days': {
      if (activeDayOfWeek) {
        next.excludeDayOfWeek = activeDayOfWeek as T['excludeDayOfWeek']
        next.dayOfWeek = undefined
      }
      break
    }
    case 'weekdays': {
      next.dayOfWeek = ['1', '2', '3', '4', '5'] as T['dayOfWeek']
      break
    }
    case 'weekends': {
      next.dayOfWeek = ['0', '6'] as T['dayOfWeek']
      break
    }
    case 'overall':
    default: {
      next.dayOfWeek = undefined
      next.timeOfDay = undefined
      next.excludeDayOfWeek = undefined
    }
  }
  return next
}

