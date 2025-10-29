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
  // Note: GHL V1 API may require locationId for some endpoints
  // Even with Location-scoped API keys, passing locationId ensures proper scoping
  async getCalendars(): Promise<GHLCalendar[]> {
    // Build URL with locationId if provided
    let url = `${this.baseUrl}/calendars/`
    if (this.locationId) {
      url = `${this.baseUrl}/calendars/?locationId=${encodeURIComponent(this.locationId)}`
    }
    
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
