export interface KPITargets {
  showRate?: number
  closeRate?: number
  qualifiedRate?: number
  cancellationRate?: number
  noShowRate?: number
  revenuePerScheduled?: number
  revenuePerShow?: number
}

type KPIStatus = 'success' | 'warning' | 'danger'

const DEFAULT_TARGETS: Required<KPITargets> = {
  showRate: 75,
  closeRate: 50,
  qualifiedRate: 80,
  cancellationRate: 15,
  noShowRate: 20,
  revenuePerScheduled: 1000,
  revenuePerShow: 1500
}

type Direction = 'higher' | 'lower'

export function getKpiStatus(
  value: number,
  target: number,
  tolerance = 0.1,
  direction: Direction = 'higher'
): KPIStatus {
  if (Number.isNaN(value) || Number.isNaN(target)) {
    return 'warning'
  }

  if (direction === 'higher') {
    if (value >= target) {
      return 'success'
    }

    if (value >= target * (1 - tolerance)) {
      return 'warning'
    }

    return 'danger'
  } else {
    if (value <= target) {
      return 'success'
    }

    if (value <= target * (1 + tolerance)) {
      return 'warning'
    }

    return 'danger'
  }
}

export function getKpiColorClass(status: KPIStatus): string {
  const colors: Record<KPIStatus, string> = {
    success: 'border-green-200 bg-green-50 text-green-700 dark:border-green-900 dark:bg-green-950 dark:text-green-200',
    warning: 'border-yellow-200 bg-yellow-50 text-yellow-700 dark:border-yellow-900 dark:bg-yellow-950 dark:text-yellow-200',
    danger: 'border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-200'
  }

  return colors[status]
}

export function getKpiBadge(status: KPIStatus): string {
  return {
    success: '✅',
    warning: '⚠️',
    danger: '🚨'
  }[status]
}

export function resolveTarget(metric: keyof KPITargets, overrides?: KPITargets): number {
  const target = overrides?.[metric]
  if (typeof target === 'number') {
    return target
  }
  return DEFAULT_TARGETS[metric]
}

