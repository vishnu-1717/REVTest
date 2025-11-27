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

interface GHLUser {
  id: string
  name: string
  email?: string
  role?: string
}

interface GHLLocation {
  id: string
  name?: string
  timezone?: string
}

export class GHLClient {
  private apiKey?: string
  private accessToken?: string
  private companyId?: string
  private locationId?: string
  // OAuth tokens use v2 API, API keys use v1 API
  private baseUrl: string
  private useOAuth: boolean
  
  /**
   * Create GHLClient with API key (legacy method)
   */
  constructor(apiKey: string, locationId?: string)
  /**
   * Create GHLClient with OAuth (new method)
   */
  constructor(companyId: string, locationId: string | undefined, useOAuth: true)
  constructor(apiKeyOrCompanyId: string, locationId?: string, useOAuth?: boolean) {
    if (useOAuth) {
      // OAuth mode - use v2 API base URL
      this.companyId = apiKeyOrCompanyId
      this.locationId = locationId
      this.useOAuth = true
      this.baseUrl = 'https://services.leadconnectorhq.com'
    } else {
      // API key mode (backward compatibility) - use v1 API base URL
      this.apiKey = apiKeyOrCompanyId
      this.locationId = locationId
      this.useOAuth = false
      this.baseUrl = 'https://rest.gohighlevel.com/v1'
    }
  }

  /**
   * Get authorization token (API key or OAuth token)
   * Automatically refreshes OAuth token if needed
   */
  private async getAuthToken(): Promise<string> {
    if (!this.useOAuth) {
      if (!this.apiKey) {
        throw new Error('GHL API key not provided')
      }
      return this.apiKey
    }

    if (!this.companyId) {
      throw new Error('Company ID not provided for OAuth')
    }

    // Import dynamically to avoid circular dependencies
    const { getGHLAccessToken } = await import('./ghl-oauth')
    const token = await getGHLAccessToken(this.companyId)
    
    if (!token) {
      throw new Error('GHL OAuth token not available. Please reconnect GHL.')
    }

    return token
  }

  /**
   * Make authenticated API request
   */
  private async makeRequest(url: string, options: RequestInit = {}): Promise<Response> {
    const token = await this.getAuthToken()
    
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string> || {})
    }

    // Determine API version based on endpoint and auth method
    // OAuth v2 API requires Version header, but different endpoints use different versions
    if (this.useOAuth) {
      // OAuth v2 API - determine version from URL
      if (url.includes('/calendars')) {
        headers['Version'] = '2021-04-15' // Calendars endpoint uses 2021-04-15
      } else if (url.includes('/users')) {
        headers['Version'] = '2021-07-28' // Users endpoint uses 2021-07-28
      } else {
        // Default to 2021-07-28 for other endpoints
        headers['Version'] = '2021-07-28'
      }
    } else {
      // API key (v1 API) - always use 2021-07-28
      headers['Version'] = '2021-07-28'
    }

    const response = await fetch(url, {
      ...options,
      headers
    })

    return response
  }
  
  // Validate API key or OAuth token by making a simple request
  async validateApiKey(): Promise<boolean> {
    try {
      // Try to fetch contacts list - this is a simpler endpoint that validates the credentials
      const url = `${this.baseUrl}/contacts`
      console.log(`[GHL API] Validating ${this.useOAuth ? 'OAuth token' : 'API key'} with: ${url}`)
      
      const response = await this.makeRequest(url, { method: 'GET' })
      
      // If we get 200 or even 401/403, the endpoint exists and credentials format is valid
      // 404 means endpoint doesn't exist, 401/403 means invalid credentials
      if (response.status === 401 || response.status === 403) {
        console.error(`[GHL API] ${this.useOAuth ? 'OAuth token' : 'API key'} validation failed: ${response.status}`)
        return false
      }
      
      // Even if we get 404, it might mean the endpoint structure is different
      // But if we get here without an exception, the credentials format is valid
      return response.status === 200 || response.status === 404
    } catch (error: any) {
      console.error(`[GHL API] ${this.useOAuth ? 'OAuth token' : 'API key'} validation error:`, error.message)
      return false
    }
  }
  
  // Fetch all calendars
  // Note: GHL V1 API calendars endpoint may not exist - try multiple endpoint structures
  async getCalendars(): Promise<GHLCalendar[]> {
    const endpoints = []
    
    // For OAuth (v2 API), use different endpoint structure
    if (this.useOAuth) {
      // OAuth v2 API endpoints - locationId is required as query parameter
      if (this.locationId) {
        // Try with trailing slash first (documented format)
        endpoints.push(
          `${this.baseUrl}/calendars/?locationId=${this.locationId}`,
          `${this.baseUrl}/calendars?locationId=${this.locationId}`
        )
      } else {
        // Try without locationId (may not work, but worth trying)
        endpoints.push(
          `${this.baseUrl}/calendars/`,
          `${this.baseUrl}/calendars`
        )
      }
    } else {
      // API key (v1 API) - try multiple endpoint patterns
      endpoints.push(
        `${this.baseUrl}/calendars`,
        `${this.baseUrl}/calendars/`,
      )
      
      // If locationId is provided, also try location-specific endpoints
      if (this.locationId) {
        endpoints.push(
          `${this.baseUrl}/locations/${this.locationId}/calendars`,
          `${this.baseUrl}/locations/${this.locationId}/calendars/`
        )
      }
    }
    
    let lastError: any = null
    
    for (const url of endpoints) {
      try {
        console.log(`[GHL API] Trying calendars endpoint: ${url}`)
        
        const response = await this.makeRequest(url, { method: 'GET' })
        
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
  
  // Fetch all users from GHL
  async getUsers(): Promise<GHLUser[]> {
    const endpoints = []
    
    // For OAuth (v2 API), use different endpoint structure
    if (this.useOAuth) {
      // OAuth v2 API endpoints - locationId is required as query parameter
      if (this.locationId) {
        // Try with trailing slash first (documented format)
        endpoints.push(
          `${this.baseUrl}/users/?locationId=${this.locationId}`,
          `${this.baseUrl}/users?locationId=${this.locationId}`
        )
      } else {
        // Try without locationId (may not work, but worth trying)
        endpoints.push(
          `${this.baseUrl}/users/`,
          `${this.baseUrl}/users`
        )
      }
    } else {
      // API key (v1 API) - try multiple endpoint patterns
      if (this.locationId) {
        endpoints.push(
          `${this.baseUrl}/locations/${this.locationId}/users`,
          `${this.baseUrl}/locations/${this.locationId}/users/`,
          `${this.baseUrl}/users?locationId=${this.locationId}`
        )
      }
      
      endpoints.push(
        `${this.baseUrl}/users`,
        `${this.baseUrl}/users/`
      )
    }
    
    for (const url of endpoints) {
      try {
        console.log(`[GHL API] Trying users endpoint: ${url}`)
        
        const response = await this.makeRequest(url, { method: 'GET' })
        
        if (response.ok) {
          const data = await response.json()
          console.log(`[GHL API] Successfully fetched users from: ${url}`)
          const users = data.users || data.data || data || []
          return Array.isArray(users) ? users : []
        }
        
        // If it's not a 404, this might be an auth error, don't try other endpoints
        if (response.status !== 404) {
          const errorText = await response.text().catch(() => response.statusText)
          console.warn(`[GHL API] Users endpoint error: ${response.status} ${response.statusText} - ${errorText}`)
          // Continue to try other endpoints
        } else {
          console.log(`[GHL API] Endpoint ${url} returned 404, trying next...`)
        }
      } catch (error: any) {
        console.warn(`[GHL API] Error trying users endpoint ${url}:`, error.message)
      }
    }
    
    // All endpoints failed - return empty array
    console.warn(`[GHL API] Users endpoint not found. GHL V1 API may not support users endpoint.`)
    return []
  }

  async getLocation(locationId?: string): Promise<GHLLocation | null> {
    const idToUse = locationId || this.locationId
    if (!idToUse) return null

    const url = `${this.baseUrl}/locations/${idToUse}`
    try {
      const response = await this.makeRequest(url, { method: 'GET' })

      if (!response.ok) {
        if (response.status === 404) {
          console.warn(`[GHL API] Location ${idToUse} not found`)
          return null
        }
        const errorText = await response.text().catch(() => response.statusText)
        throw new Error(`GHL API error: ${response.status} ${response.statusText} - ${errorText}`)
      }

      const data = await response.json()
      return data.location || data || null
    } catch (error: any) {
      console.warn('[GHL API] Failed to fetch location info:', error.message)
      return null
    }
  }
  
  // Fetch single contact
  async getContact(contactId: string): Promise<GHLContact | null> {
    const response = await this.makeRequest(`${this.baseUrl}/contacts/${contactId}`, { method: 'GET' })
    
    if (!response.ok) {
      if (response.status === 404) return null
      throw new Error(`GHL API error: ${response.statusText}`)
    }
    
    const data = await response.json()
    return data.contact || null
  }
  
  // Search contacts by email
  async searchContactByEmail(email: string): Promise<GHLContact | null> {
    const response = await this.makeRequest(
      `${this.baseUrl}/contacts/?email=${encodeURIComponent(email)}`,
      { method: 'GET' }
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
      
      const response = await this.makeRequest(url, { method: 'GET' })
      
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
    const endpoints = []
    
    // Try multiple endpoint patterns
    if (this.locationId) {
      endpoints.push(
        `${this.baseUrl}/locations/${this.locationId}/appointments?contactId=${contactId}`,
        `${this.baseUrl}/locations/${this.locationId}/appointments/contact/${contactId}`
      )
    }
    
    endpoints.push(
      `${this.baseUrl}/appointments?contactId=${contactId}`,
      `${this.baseUrl}/appointments?contact=${contactId}`
    )
    
    for (const url of endpoints) {
      try {
        console.log(`[GHL API] Trying appointments endpoint: ${url}`)
        
        const response = await this.makeRequest(url, { method: 'GET' })
        
        if (response.ok) {
          const data = await response.json()
          const appointments = data.appointments || data.data || data.contacts || []
          if (appointments.length > 0) {
            console.log(`[GHL API] Found ${appointments.length} appointments via: ${url}`)
            return appointments
          }
        } else if (response.status !== 404) {
          // Log error but continue to next endpoint
          const errorText = await response.text().catch(() => response.statusText)
          console.warn(`[GHL API] Endpoint ${url} returned ${response.status}: ${errorText}`)
        }
      } catch (error: any) {
        console.warn(`[GHL API] Error trying endpoint ${url}:`, error.message)
      }
    }
    
    // If all endpoints failed, try fetching recent appointments and filter client-side
    return this.getRecentAppointmentsForContact(contactId)
  }
  
  // Get recent appointments for a contact by fetching all recent appointments and filtering
  async getRecentAppointmentsForContact(contactId: string): Promise<any[]> {
    try {
      const endpoints = []
      
      if (this.locationId) {
        endpoints.push(
          `${this.baseUrl}/locations/${this.locationId}/appointments`,
          `${this.baseUrl}/appointments?locationId=${this.locationId}`
        )
      }
      
      endpoints.push(`${this.baseUrl}/appointments`)
      
      for (const url of endpoints) {
        try {
          console.log(`[GHL API] Trying to fetch recent appointments: ${url}`)
          
      const response = await this.makeRequest(url, { method: 'GET' })
          
          if (response.ok) {
            const data = await response.json()
            const allAppointments = data.appointments || data.data || []
            
            // Filter by contactId
            const contactAppointments = allAppointments.filter((apt: any) => 
              apt.contactId === contactId || 
              apt.contact?.id === contactId ||
              apt.contact_id === contactId
            )
            
            if (contactAppointments.length > 0) {
              console.log(`[GHL API] Found ${contactAppointments.length} appointments for contact by filtering`)
              return contactAppointments
            }
          }
        } catch (error: any) {
          console.warn(`[GHL API] Error fetching recent appointments from ${url}:`, error.message)
        }
      }
    } catch (error: any) {
      console.error(`[GHL API] Error in getRecentAppointmentsForContact:`, error.message)
    }
    
    return []
  }
  
  // Get a specific appointment by ID
  async getAppointment(appointmentId: string): Promise<any | null> {
    try {
      const url = `${this.baseUrl}/appointments/${appointmentId}`
      console.log(`[GHL API] Fetching appointment: ${url}`)
      
      const response = await this.makeRequest(url, { method: 'GET' })
      
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

/**
 * Factory function to create GHLClient
 * Supports both OAuth and API key methods
 */
export async function createGHLClient(companyId: string): Promise<GHLClient | null> {
  const { withPrisma } = await import('./db')
  const { isGHLOAuthConnected, getGHLLocationId } = await import('./ghl-oauth')
  
  return await withPrisma(async (prisma) => {
    // Check if OAuth is connected
    const oauthConnected = await isGHLOAuthConnected(companyId)
    
    if (oauthConnected) {
      // Use OAuth
      const locationId = await getGHLLocationId(companyId)
      return new GHLClient(companyId, locationId || undefined, true)
    }
    
    // Fall back to API key (backward compatibility)
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { ghlApiKey: true, ghlLocationId: true }
    })
    
    if (company?.ghlApiKey) {
      return new GHLClient(company.ghlApiKey, company.ghlLocationId || undefined)
    }
    
    return null
  })
}
