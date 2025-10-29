interface GHLContact {
  id: string
  name: string
  firstName?: string
  lastName?: string
  email?: string
  phone?: string
  source?: string
  tags?: string[]
  customFields?: Record<string, any>
}

interface GHLCalendar {
  id: string
  name: string
  description?: string
  locationId: string
  isActive: boolean
}

export class GHLClient {
  private apiKey: string
  private locationId?: string
  private baseUrl = 'https://rest.gohighlevel.com/v1'
  
  constructor(apiKey: string, locationId?: string) {
    this.apiKey = apiKey
    this.locationId = locationId
  }
  
  // Fetch all calendars
  // For GHL V1 API, try different endpoint structures:
  // 1. /calendars (for location-scoped API keys)
  // 2. /locations/{locationId}/calendars (if locationId is needed)
  async getCalendars(): Promise<GHLCalendar[]> {
    // Try the standard endpoint first (for location-scoped API keys)
    let url = `${this.baseUrl}/calendars`
    
    // If locationId is provided and the standard endpoint fails,
    // we can try the location-specific endpoint as fallback
    // For now, let's try the standard endpoint
    
    console.log(`[GHL API] Fetching calendars from: ${url}`, this.locationId ? `(locationId: ${this.locationId})` : '(location-scoped API key)')
    
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Version': '2021-07-28',
        'Content-Type': 'application/json'
      }
    })
    
    if (!response.ok) {
      // Try to get error details from response
      let errorDetails = response.statusText
      try {
        const errorBody = await response.text()
        if (errorBody) {
          errorDetails = errorBody
          // Try to parse as JSON if possible
          try {
            const jsonError = JSON.parse(errorBody)
            errorDetails = jsonError.message || jsonError.error || errorBody
          } catch {
            // If not JSON, use text as is
          }
        }
      } catch {
        // If we can't read the body, use status text
      }
      
      // Create error with status code and details
      const error = new Error(`GHL API error: ${response.status} ${response.statusText}`)
      ;(error as any).status = response.status
      ;(error as any).details = errorDetails
      ;(error as any).url = url // Include URL in error for debugging
      console.error(`[GHL API] Request failed:`, {
        url,
        status: response.status,
        statusText: response.statusText,
        details: errorDetails
      })
      throw error
    }
    
    const data = await response.json()
    return data.calendars || []
  }
  
  // Fetch single contact
  async getContact(contactId: string): Promise<GHLContact | null> {
    const response = await fetch(`${this.baseUrl}/contacts/${contactId}`, {
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Version': '2021-07-28'
      }
    })
    
    if (!response.ok) {
      if (response.status === 404) return null
      throw new Error(`GHL API error: ${response.statusText}`)
    }
    
    const data = await response.json()
    return data.contact || null
  }
  
  // Search contacts by email
  async searchContactByEmail(email: string): Promise<GHLContact | null> {
    const response = await fetch(
      `${this.baseUrl}/contacts/?email=${encodeURIComponent(email)}`,
      {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Version': '2021-07-28'
        }
      }
    )
    
    if (!response.ok) {
      throw new Error(`GHL API error: ${response.statusText}`)
    }
    
    const data = await response.json()
    const contacts = data.contacts || []
    return contacts.length > 0 ? contacts[0] : null
  }
}
