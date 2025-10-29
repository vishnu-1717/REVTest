import { prisma } from './prisma'

interface AttributionResult {
  trafficSource: string | null
  leadSource: string | null
  confidence: number
}

export async function resolveAttribution(
  appointmentId: string
): Promise<AttributionResult> {
  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    include: {
      contact: true,
      calendarRelation: true,
      company: true
    }
  })
  
  if (!appointment) {
    return { trafficSource: null, leadSource: null, confidence: 0 }
  }
  
  const { company, contact, calendarRelation } = appointment
  
  // Route to appropriate attribution method
  switch (company.attributionStrategy) {
    case 'ghl_fields':
      return resolveFromGHLFields(contact, company.attributionSourceField)
    
    case 'calendars':
      return resolveFromCalendar(calendarRelation)
    
    case 'hyros':
      return resolveFromHyros(contact)
    
    case 'tags':
      return resolveFromTags(contact)
    
    case 'none':
    default:
      return { trafficSource: null, leadSource: null, confidence: 0 }
  }
}

// Strategy 1: GHL Custom Fields (Most Common - 80% of companies)
function resolveFromGHLFields(
  contact: any,
  fieldPath: string | null
): AttributionResult {
  if (!fieldPath || !contact.customFields) {
    return { trafficSource: null, leadSource: null, confidence: 0 }
  }
  
  // Handle nested field paths like "contact.source"
  const keys = fieldPath.split('.')
  let value: any = contact.customFields
  
  for (const key of keys) {
    if (key === 'contact') continue // Skip "contact" prefix
    value = value?.[key]
  }
  
  if (value && typeof value === 'string') {
    return {
      trafficSource: value,
      leadSource: 'ghl_field',
      confidence: 1.0
    }
  }
  
  // Fallback: Check common field names
  const commonFields = ['source', 'lead_source', 'traffic_source', 'utm_source', 'leadSource']
  for (const field of commonFields) {
    const val = contact.customFields[field]
    if (val && typeof val === 'string') {
      return {
        trafficSource: val,
        leadSource: 'ghl_field',
        confidence: 0.8
      }
    }
  }
  
  return { trafficSource: null, leadSource: null, confidence: 0 }
}

// Strategy 2: Calendar Names (BudgetDog style - 20% of companies)
function resolveFromCalendar(
  calendar: any
): AttributionResult {
  if (!calendar) {
    return { trafficSource: null, leadSource: null, confidence: 0 }
  }
  
  // If admin has manually set traffic source, use it
  if (calendar.trafficSource) {
    return {
      trafficSource: calendar.trafficSource,
      leadSource: 'calendar',
      confidence: 1.0
    }
  }
  
  // Try to extract from calendar name patterns:
  // "Sales Call (META)" → "META"
  // "Application (GOOGLE)" → "GOOGLE"
  const patterns = [
    /\(([^)]+)\)$/,           // "Name (SOURCE)"
    /\[([^\]]+)\]$/,          // "Name [SOURCE]"
    /[-_]\s*([A-Z0-9-]+)$/    // "Name - SOURCE" or "Name_SOURCE"
  ]
  
  for (const pattern of patterns) {
    const match = calendar.name.match(pattern)
    if (match) {
      return {
        trafficSource: match[1].trim(),
        leadSource: 'calendar',
        confidence: 0.8
      }
    }
  }
  
  return { trafficSource: null, leadSource: null, confidence: 0 }
}

// Strategy 3: Hyros (for companies using Hyros)
async function resolveFromHyros(
  contact: any
): Promise<AttributionResult> {
  // This will be populated by daily Hyros sync (Part 2)
  const hyrosData = await prisma.hyrosAttribution?.findFirst({
    where: { contactId: contact.id }
  })
  
  if (hyrosData?.lastSource) {
    return {
      trafficSource: hyrosData.lastSource,
      leadSource: 'hyros',
      confidence: 1.0
    }
  }
  
  return { trafficSource: null, leadSource: null, confidence: 0 }
}

// Strategy 4: GHL Tags
function resolveFromTags(
  contact: any
): AttributionResult {
  if (!contact.tags || contact.tags.length === 0) {
    return { trafficSource: null, leadSource: null, confidence: 0 }
  }
  
  // Look for tags that look like traffic sources
  const sourcePatterns = [
    /^source[:\-\s](.+)$/i,
    /^traffic[:\-\s](.+)$/i,
    /^(meta|facebook|google|youtube|organic|email|instagram|linkedin|twitter|tiktok)$/i
  ]
  
  for (const tag of contact.tags) {
    for (const pattern of sourcePatterns) {
      const match = tag.match(pattern)
      if (match) {
        return {
          trafficSource: match[1] || tag,
          leadSource: 'tag',
          confidence: 0.8
        }
      }
    }
  }
  
  return { trafficSource: null, leadSource: null, confidence: 0 }
}
