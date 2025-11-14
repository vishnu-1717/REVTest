/**
 * Analytics Views & Presets
 * Manages saved filter combinations and layout preferences
 */

import { FilterState } from '@/app/(dashboard)/analytics/page'

export interface AnalyticsView {
  id: string
  name: string
  description?: string
  filters: Partial<FilterState>
  layout?: {
    activeView?: 'overview' | 'closers' | 'calendars' | 'objections'
    overviewMode?: 'charts' | 'tables'
    compareMode?: boolean
    comparisonTarget?: string
  }
  isPreset?: boolean
  createdAt?: string
  updatedAt?: string
}

const STORAGE_KEY = 'analytics_views'
const PRESET_VIEWS: AnalyticsView[] = [
  {
    id: 'overview',
    name: 'Overview',
    description: 'High-level metrics and trends',
    filters: {},
    layout: {
      activeView: 'overview',
      overviewMode: 'charts',
      compareMode: false
    },
    isPreset: true
  },
  {
    id: 'booking-performance',
    name: 'Booking Performance',
    description: 'Analyze booking trends and lead times',
    filters: {},
    layout: {
      activeView: 'overview',
      overviewMode: 'charts',
      compareMode: false
    },
    isPreset: true
  },
  {
    id: 'closer-performance',
    name: 'Closer Performance',
    description: 'Compare closer metrics and rankings',
    filters: {},
    layout: {
      activeView: 'closers',
      overviewMode: 'tables',
      compareMode: false
    },
    isPreset: true
  },
  {
    id: 'calendar-analysis',
    name: 'Calendar Analysis',
    description: 'Compare calendar sources and performance',
    filters: {},
    layout: {
      activeView: 'calendars',
      overviewMode: 'tables',
      compareMode: false
    },
    isPreset: true
  },
  {
    id: 'objection-insights',
    name: 'Objection Insights',
    description: 'Analyze objections and conversion patterns',
    filters: {},
    layout: {
      activeView: 'objections',
      overviewMode: 'tables',
      compareMode: false
    },
    isPreset: true
  }
]

/**
 * Load all views from localStorage
 */
export function loadViews(): AnalyticsView[] {
  if (typeof window === 'undefined') {
    return PRESET_VIEWS
  }

  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) {
      return PRESET_VIEWS
    }

    const customViews: AnalyticsView[] = JSON.parse(stored)
    return [...PRESET_VIEWS, ...customViews]
  } catch (error) {
    console.error('Failed to load views from localStorage:', error)
    return PRESET_VIEWS
  }
}

/**
 * Save a custom view to localStorage
 */
export function saveView(view: Omit<AnalyticsView, 'id' | 'createdAt' | 'updatedAt'>): AnalyticsView {
  if (typeof window === 'undefined') {
    throw new Error('Cannot save view: window is not available')
  }

  const customViews = loadCustomViews()
  const newView: AnalyticsView = {
    ...view,
    id: `view_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    isPreset: false
  }

  customViews.push(newView)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(customViews))

  return newView
}

/**
 * Update an existing view
 */
export function updateView(viewId: string, updates: Partial<AnalyticsView>): AnalyticsView | null {
  if (typeof window === 'undefined') {
    return null
  }

  const customViews = loadCustomViews()
  const index = customViews.findIndex(v => v.id === viewId)

  if (index === -1) {
    return null
  }

  const updated: AnalyticsView = {
    ...customViews[index],
    ...updates,
    updatedAt: new Date().toISOString()
  }

  customViews[index] = updated
  localStorage.setItem(STORAGE_KEY, JSON.stringify(customViews))

  return updated
}

/**
 * Delete a custom view
 */
export function deleteView(viewId: string): boolean {
  if (typeof window === 'undefined') {
    return false
  }

  const customViews = loadCustomViews()
  const filtered = customViews.filter(v => v.id !== viewId)

  if (filtered.length === customViews.length) {
    return false // View not found
  }

  localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered))
  return true
}

/**
 * Get a view by ID
 */
export function getView(viewId: string): AnalyticsView | null {
  const allViews = loadViews()
  return allViews.find(v => v.id === viewId) || null
}

/**
 * Load only custom views (excluding presets)
 */
function loadCustomViews(): AnalyticsView[] {
  if (typeof window === 'undefined') {
    return []
  }

  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) {
      return []
    }
    return JSON.parse(stored)
  } catch (error) {
    console.error('Failed to load custom views:', error)
    return []
  }
}

/**
 * Encode filters into URL-friendly format
 */
export function encodeViewToUrl(filters: Partial<FilterState>, layout?: AnalyticsView['layout']): string {
  const params = new URLSearchParams()

  // Add filters
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      if (Array.isArray(value)) {
        params.set(key, value.join(','))
      } else {
        params.set(key, String(value))
      }
    }
  })

  // Add layout preferences
  if (layout) {
    if (layout.activeView) {
      params.set('view', layout.activeView)
    }
    if (layout.overviewMode) {
      params.set('overviewMode', layout.overviewMode)
    }
    if (layout.compareMode) {
      params.set('compareMode', 'true')
    }
    if (layout.comparisonTarget) {
      params.set('comparisonTarget', layout.comparisonTarget)
    }
  }

  return params.toString()
}

/**
 * Decode URL parameters into filters and layout
 */
export function decodeUrlToView(searchParams: URLSearchParams): {
  filters: Partial<FilterState>
  layout?: AnalyticsView['layout']
} {
  const filters: Partial<FilterState> = {}
  
  const dateFrom = searchParams.get('dateFrom')
  if (dateFrom) {
    filters.dateFrom = dateFrom
  }
  
  const dateTo = searchParams.get('dateTo')
  if (dateTo) {
    filters.dateTo = dateTo
  }

  // Parse filter parameters
  const dayOfWeek = searchParams.get('dayOfWeek')
  if (dayOfWeek) {
    filters.dayOfWeek = dayOfWeek // Keep as string, comma-separated if multiple
  }

  const closer = searchParams.get('closer')
  if (closer) {
    filters.closer = closer
  }

  const status = searchParams.get('status')
  if (status) {
    filters.status = status
  }

  const objectionType = searchParams.get('objectionType')
  if (objectionType) {
    filters.objectionType = objectionType
  }

  const appointmentType = searchParams.get('appointmentType')
  if (appointmentType) {
    filters.appointmentType = appointmentType
  }

  const followUpNeeded = searchParams.get('followUpNeeded')
  if (followUpNeeded) {
    filters.followUpNeeded = followUpNeeded
  }

  const nurtureType = searchParams.get('nurtureType')
  if (nurtureType) {
    filters.nurtureType = nurtureType
  }

  const minDealSize = searchParams.get('minDealSize')
  if (minDealSize) {
    filters.minDealSize = minDealSize
  }

  const maxDealSize = searchParams.get('maxDealSize')
  if (maxDealSize) {
    filters.maxDealSize = maxDealSize
  }

  const calendar = searchParams.get('calendar')
  if (calendar) {
    filters.calendar = calendar
  }

  const timeOfDay = searchParams.get('timeOfDay')
  if (timeOfDay) {
    filters.timeOfDay = timeOfDay
  }

  // Parse layout preferences
  const layout: AnalyticsView['layout'] = {}
  const view = searchParams.get('view')
  if (view && ['overview', 'closers', 'calendars', 'objections'].includes(view)) {
    layout.activeView = view as any
  }

  const overviewMode = searchParams.get('overviewMode')
  if (overviewMode && ['charts', 'tables'].includes(overviewMode)) {
    layout.overviewMode = overviewMode as 'charts' | 'tables'
  }

  if (searchParams.get('compareMode') === 'true') {
    layout.compareMode = true
  }

  const comparisonTarget = searchParams.get('comparisonTarget')
  if (comparisonTarget) {
    layout.comparisonTarget = comparisonTarget
  }

  return {
    filters,
    layout: Object.keys(layout).length > 0 ? layout : undefined
  }
}

