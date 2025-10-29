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
  private baseUrl = 'https://rest.gohighlevel.com/v1'
  
  constructor(apiKey: string) {
    this.apiKey = apiKey
  }
  
  // Fetch all calendars
  async getCalendars(): Promise<GHLCalendar[]> {
    const response = await fetch(`${this.baseUrl}/calendars/`, {
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Version': '2021-07-28'
      }
    })
    
    if (!response.ok) {
      throw new Error(`GHL API error: ${response.statusText}`)
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
