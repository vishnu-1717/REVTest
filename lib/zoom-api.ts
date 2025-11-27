import { withPrisma } from './db'
import crypto from 'crypto'

// Encryption utilities (reuse from ghl-oauth)
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || crypto.randomBytes(32).toString('hex')
const ALGORITHM = 'aes-256-gcm'

function encrypt(text: string): string {
  const iv = crypto.randomBytes(16)
  const cipher = crypto.createCipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY, 'hex'), iv)
  
  let encrypted = cipher.update(text, 'utf8', 'hex')
  encrypted += cipher.final('hex')
  
  const authTag = cipher.getAuthTag()
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`
}

function decrypt(encryptedData: string): string {
  const parts = encryptedData.split(':')
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted data format')
  }
  
  const [ivHex, authTagHex, encrypted] = parts
  const iv = Buffer.from(ivHex, 'hex')
  const authTag = Buffer.from(authTagHex, 'hex')
  
  const decipher = crypto.createDecipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY, 'hex'), iv)
  decipher.setAuthTag(authTag)
  
  let decrypted = decipher.update(encrypted, 'hex', 'utf8')
  decrypted += decipher.final('utf8')
  
  return decrypted
}

export interface ZoomRecording {
  id: string
  meeting_id: string
  recording_start: string
  recording_end: string
  file_type: string
  file_extension: string
  file_size: number
  play_url: string
  download_url: string
  status: string
  recording_type: string
}

export interface ZoomTokenResponse {
  access_token: string
  token_type: string
  expires_in: number
  scope: string
}

export class ZoomClient {
  private accountId: string
  private clientId: string
  private clientSecret: string
  private companyId: string
  private baseUrl = 'https://api.zoom.us/v2'
  private oauthUrl = 'https://zoom.us/oauth/token'
  
  constructor(accountId: string, clientId: string, clientSecret: string, companyId: string) {
    this.accountId = accountId
    this.clientId = clientId
    this.clientSecret = clientSecret
    this.companyId = companyId
  }

  /**
   * Get OAuth access token using Account Credentials Grant
   * Zoom uses Server-to-Server OAuth (Account Credentials Grant)
   */
  async getAccessToken(): Promise<string> {
    return await withPrisma(async (prisma) => {
      const company = await prisma.company.findUnique({
        where: { id: this.companyId },
        select: {
          zoomAccessToken: true,
          zoomTokenExpiresAt: true,
          zoomRefreshToken: true
        }
      })

      // Check if token is still valid (with 5 minute buffer)
      if (company?.zoomAccessToken && company.zoomTokenExpiresAt) {
        const now = new Date()
        const expiresAt = company.zoomTokenExpiresAt
        const bufferTime = 5 * 60 * 1000 // 5 minutes

        if (new Date(expiresAt.getTime() - bufferTime) > now) {
          // Token is still valid, return it
          try {
            return decrypt(company.zoomAccessToken)
          } catch (error) {
            console.error('[Zoom API] Error decrypting token:', error)
            // Fall through to get new token
          }
        }
      }

      // Token expired or doesn't exist, get new one
      return await this.refreshAccessToken()
    })
  }

  /**
   * Refresh access token (Account Credentials Grant)
   */
  async refreshAccessToken(): Promise<string> {
    // Zoom Account Credentials Grant uses base64 encoded clientId:clientSecret
    const credentials = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64')

    const response = await fetch(`${this.oauthUrl}?grant_type=account_credentials&account_id=${this.accountId}`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error(`[Zoom API] Token refresh failed: ${response.status} ${errorText}`)
      throw new Error(`Failed to get Zoom access token: ${response.status}`)
    }

    const tokenData: ZoomTokenResponse = await response.json()

    // Calculate expiration time
    const expiresAt = new Date()
    expiresAt.setSeconds(expiresAt.getSeconds() + tokenData.expires_in)

    // Encrypt and store tokens
    await withPrisma(async (prisma) => {
      await prisma.company.update({
        where: { id: this.companyId },
        data: {
          zoomAccessToken: encrypt(tokenData.access_token),
          zoomTokenExpiresAt: expiresAt,
          zoomAccountId: this.accountId
        }
      })
    })

    console.log(`[Zoom API] Token refreshed successfully for company ${this.companyId}`)
    return tokenData.access_token
  }

  /**
   * Get meeting recordings
   */
  async getMeetingRecordings(meetingId: string): Promise<ZoomRecording[]> {
    const token = await this.getAccessToken()
    
    const response = await fetch(`${this.baseUrl}/meetings/${meetingId}/recordings`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    })

    if (!response.ok) {
      if (response.status === 404) {
        console.log(`[Zoom API] No recordings found for meeting ${meetingId}`)
        return []
      }
      const errorText = await response.text()
      throw new Error(`Failed to get recordings: ${response.status} ${errorText}`)
    }

    const data = await response.json()
    const recordings = data.recording_files || []

    // Filter for transcript files
    return recordings.filter((recording: ZoomRecording) => 
      recording.file_type === 'TRANSCRIPT' || recording.file_extension === 'vtt'
    )
  }

  /**
   * Download transcript file
   */
  async downloadTranscript(downloadUrl: string): Promise<string> {
    const token = await this.getAccessToken()
    
    const response = await fetch(downloadUrl, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Failed to download transcript: ${response.status} ${errorText}`)
    }

    return await response.text()
  }

  /**
   * Validate credentials by attempting to get an access token
   */
  async validateCredentials(): Promise<boolean> {
    try {
      await this.getAccessToken()
      return true
    } catch (error) {
      console.error('[Zoom API] Credential validation failed:', error)
      return false
    }
  }

  /**
   * Get meeting details
   */
  async getMeeting(meetingId: string): Promise<any> {
    const token = await this.getAccessToken()
    
    const response = await fetch(`${this.baseUrl}/meetings/${meetingId}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    })

    if (!response.ok) {
      if (response.status === 404) {
        return null
      }
      const errorText = await response.text()
      throw new Error(`Failed to get meeting: ${response.status} ${errorText}`)
    }

    return await response.json()
  }
}

/**
 * Create ZoomClient for a company
 */
export async function createZoomClient(companyId: string): Promise<ZoomClient | null> {
  return await withPrisma(async (prisma) => {
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: {
        zoomAccountId: true,
        zoomClientId: true,
        zoomClientSecret: true
      }
    })

    if (!company?.zoomAccountId || !company.zoomClientId || !company.zoomClientSecret) {
      return null
    }

    try {
      const decryptedSecret = decrypt(company.zoomClientSecret)
      return new ZoomClient(
        company.zoomAccountId,
        company.zoomClientId,
        decryptedSecret,
        companyId
      )
    } catch (error) {
      console.error('[Zoom API] Error decrypting client secret:', error)
      return null
    }
  })
}

