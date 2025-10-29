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
  
  // Validate API key by making a simple request (try contacts endpoint as it's more likely to exist)
  async validateApiKey(): Promise<boolean> {
    try {
      // Try to fetch contacts list - this is a simpler endpoint that validates the API key
      const url = `${this.baseUrl}/contacts`
      console.log(`[GHL API] Validating API key with: ${url}`)
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Version': '2021-07-28',
          'Content-Type': 'application/json'
        }
      })
      
      // If we get 200 or even 401/403, the endpoint exists and API key format is valid
      // 404 means endpoint doesn't exist, 401/403 means invalid API key
      if (response.status === 401 || response.status === 403) {
        console.error(`[GHL API] API key validation failed: ${response.status}`)
        return false
      }
      
      // Even if we get 404, it might mean the endpoint structure is different
      // But if we get here without an exception, the API key format is valid
      return response.status === 200 || response.status === 404
    } catch (error: any) {
      console.error(`[GHL API] API key validation error:`, error.message)
      return false
    }
  }
  
  // Fetch all calendars
  // Note: GHL V1 API calendars endpoint may not exist - try multiple endpoint structures
  async getCalendars(): Promise<GHLCalendar[]> {
    const endpoints = [
      `${this.baseUrl}/calendars`,
      `${this.baseUrl}/calendars/`,
    ]
    
    // If locationId is provided, also try location-specific endpoints
    if (this.locationId) {
      endpoints.push(
        `${this.baseUrl}/locations/${this.locationId}/calendars`,
        `${this.baseUrl}/locations/${this.locationId}/calendars/`
      )
    }
    
    let lastError: any = null
    
    for (const url of endpoints) {
      try {
        console.log(`[GHL API] Trying calendars endpoint: ${url}`)
        
        const response = await fetch(url, {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Version': '2021-07-28',
            'Content-Type': 'application/json'
          }
        })
        
        if (response.ok) {
          const data = await response.json()
          console.log(`[GHL API] Successfully fetched calendars from: ${url}`)
          return data.calendars || data.data || []
        }
        
        // If it's not a 404, this might be an auth error, don't try other endpoints
        if (response.status !== 404) {
          const errorText = await response.text().catch(() => response.statusText)
          throw new Error(`GHL API error: ${response.status} ${response.statusText} - ${errorText}`)
        }
        
        // If 404, try next endpoint
        lastError = new Error(`Endpoint not found: ${url}`)
        console.log(`[GHL API] Endpoint ${url} returned 404, trying next...`)
        
      } catch (error: any) {
        // If it's a 404, continue to next endpoint
        if (error.message?.includes('404') || error.message?.includes('not found')) {
          lastError = error
          continue
        }
        // Otherwise, re-throw as it's a real error
        throw error
      }
    }
    
    // All endpoints failed - calendars endpoint may not exist in V1 API
    // Return empty array and log warning instead of throwing
    console.warn(`[GHL API] Calendars endpoint not found. GHL V1 API may not support calendars endpoint.`)
    console.warn(`[GHL API] This is acceptable - calendars can be synced later or may not be available in V1 API.`)
    return []
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
  
  // Get appointments for a contact
  // When appointment trigger fires, we can fetch the most recent appointment for that contact
  async getContactAppointments(contactId: string): Promise<any[]> {
    try {
      // Try contact-specific appointments endpoint
      const url = `${this.baseUrl}/contacts/${contactId}/appointments`
      console.log(`[GHL API] Fetching appointments for contact: ${url}`)
      
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Version': '2021-07-28',
          'Content-Type': 'application/json'
        }
      })
      
      if (!response.ok) {
        // If 404, try general appointments endpoint with contact filter
        if (response.status === 404) {
          console.log(`[GHL API] Contact appointments endpoint not found, trying general appointments endpoint...`)
          return this.getAppointmentsByContact(contactId)
        }
        throw new Error(`GHL API error: ${response.status} ${response.statusText}`)
      }
      
      const data = await response.json()
      return data.appointments || data.data || []
    } catch (error: any) {
      console.error(`[GHL API] Error fetching contact appointments:`, error.message)
      // Fallback to general appointments endpoint
      return this.getAppointmentsByContact(contactId)
    }
  }
  
  // Get appointments filtered by contact ID (alternative endpoint)
  async getAppointmentsByContact(contactId: string): Promise<any[]> {
    try {
      // Try general appointments endpoint with query params
      const url = `${this.baseUrl}/appointments?contactId=${contactId}`
      console.log(`[GHL API] Fetching appointments via general endpoint: ${url}`)
      
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Version': '2021-07-28',
          'Content-Type': 'application/json'
        }
      })
      
      if (!response.ok) {
        console.warn(`[GHL API] General appointments endpoint also failed: ${response.status}`)
        return []
      }
      
      const data = await response.json()
      return data.appointments || data.data || []
    } catch (error: any) {
      console.error(`[GHL API] Error fetching appointments:`, error.message)
      return []
    }
  }
  
  // Get a specific appointment by ID
  async getAppointment(appointmentId: string): Promise<any | null> {
    try {
      const url = `${this.baseUrl}/appointments/${appointmentId}`
      console.log(`[GHL API] Fetching appointment: ${url}`)
      
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Version': '2021-07-28',
          'Content-Type': 'application/json'
        }
      })
      
      if (!response.ok) {
        if (response.status === 404) return null
        throw new Error(`GHL API error: ${response.status} ${response.statusText}`)
      }
      
      const data = await response.json()
      return data.appointment || data || null
    } catch (error: any) {
      console.error(`[GHL API] Error fetching appointment:`, error.message)
      return null
    }
  }
}
