import crypto from 'crypto'
import { withPrisma } from './db'

// Encryption key - should be stored in environment variable
// For production, use: process.env.ENCRYPTION_KEY (32-byte hex string)
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || crypto.randomBytes(32).toString('hex')
const ALGORITHM = 'aes-256-gcm'

/**
 * Encrypt sensitive data (OAuth tokens)
 */
function encrypt(text: string): string {
  const iv = crypto.randomBytes(16)
  const cipher = crypto.createCipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY, 'hex'), iv)
  
  let encrypted = cipher.update(text, 'utf8', 'hex')
  encrypted += cipher.final('hex')
  
  const authTag = cipher.getAuthTag()
  
  // Return iv:authTag:encrypted
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`
}

/**
 * Decrypt sensitive data (OAuth tokens)
 */
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

/**
 * GHL OAuth Token Response
 */
export interface GHLTokenResponse {
  access_token: string
  refresh_token: string
  expires_in: number
  token_type: string
  scope?: string
}

/**
 * Get GHL OAuth access token for a company
 * Automatically refreshes if expired
 */
export async function getGHLAccessToken(companyId: string): Promise<string | null> {
  return await withPrisma(async (prisma) => {
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: {
        ghlOAuthAccessToken: true,
        ghlOAuthRefreshToken: true,
        ghlOAuthExpiresAt: true,
        ghlMarketplaceClientId: true
      }
    })

    if (!company?.ghlOAuthAccessToken || !company.ghlOAuthRefreshToken) {
      return null
    }

    // Check if token is expired (with 5 minute buffer)
    const now = new Date()
    const expiresAt = company.ghlOAuthExpiresAt
    const bufferTime = 5 * 60 * 1000 // 5 minutes in milliseconds

    if (expiresAt && new Date(expiresAt.getTime() - bufferTime) <= now) {
      // Token expired or about to expire, refresh it
      console.log(`[GHL OAuth] Token expired for company ${companyId}, refreshing...`)
      const newToken = await refreshGHLAccessToken(companyId)
      return newToken
    }

    // Decrypt and return current token
    try {
      return decrypt(company.ghlOAuthAccessToken)
    } catch (error) {
      console.error(`[GHL OAuth] Error decrypting token for company ${companyId}:`, error)
      return null
    }
  })
}

/**
 * Refresh GHL OAuth access token
 */
export async function refreshGHLAccessToken(companyId: string): Promise<string | null> {
  return await withPrisma(async (prisma) => {
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: {
        ghlOAuthRefreshToken: true,
        ghlMarketplaceClientId: true
      }
    })

    if (!company?.ghlOAuthRefreshToken) {
      console.error(`[GHL OAuth] No refresh token found for company ${companyId}`)
      return null
    }

    const clientId = company.ghlMarketplaceClientId || process.env.GHL_MARKETPLACE_CLIENT_ID
    const clientSecret = process.env.GHL_MARKETPLACE_CLIENT_SECRET

    if (!clientId || !clientSecret) {
      console.error('[GHL OAuth] Missing GHL_MARKETPLACE_CLIENT_ID or GHL_MARKETPLACE_CLIENT_SECRET')
      return null
    }

    try {
      const decryptedRefreshToken = decrypt(company.ghlOAuthRefreshToken)

      // GHL OAuth token refresh endpoint
      // GHL requires application/x-www-form-urlencoded, not JSON
      const params = new URLSearchParams()
      params.append('client_id', clientId)
      params.append('client_secret', clientSecret)
      params.append('grant_type', 'refresh_token')
      params.append('refresh_token', decryptedRefreshToken)
      
      const response = await fetch('https://services.leadconnectorhq.com/oauth/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: params.toString()
      })

      if (!response.ok) {
        const errorText = await response.text()
        console.error(`[GHL OAuth] Token refresh failed: ${response.status} ${errorText}`)
        return null
      }

      const tokenData: GHLTokenResponse = await response.json()

      // Calculate expiration time
      const expiresAt = new Date()
      expiresAt.setSeconds(expiresAt.getSeconds() + tokenData.expires_in)

      // Encrypt and store new tokens
      await prisma.company.update({
        where: { id: companyId },
        data: {
          ghlOAuthAccessToken: encrypt(tokenData.access_token),
          ghlOAuthRefreshToken: encrypt(tokenData.refresh_token),
          ghlOAuthExpiresAt: expiresAt
        }
      })

      console.log(`[GHL OAuth] Token refreshed successfully for company ${companyId}`)
      return tokenData.access_token
    } catch (error) {
      console.error(`[GHL OAuth] Error refreshing token for company ${companyId}:`, error)
      return null
    }
  })
}

/**
 * Store GHL OAuth tokens for a company
 */
export async function storeGHLOAuthTokens(
  companyId: string,
  tokenData: GHLTokenResponse,
  locationId?: string
): Promise<void> {
  await withPrisma(async (prisma) => {
    const expiresAt = new Date()
    expiresAt.setSeconds(expiresAt.getSeconds() + tokenData.expires_in)

    await prisma.company.update({
      where: { id: companyId },
      data: {
        ghlOAuthAccessToken: encrypt(tokenData.access_token),
        ghlOAuthRefreshToken: encrypt(tokenData.refresh_token),
        ghlOAuthExpiresAt: expiresAt,
        ghlLocationId: locationId || undefined,
        ghlAppInstalledAt: new Date(),
        ghlAppUninstalledAt: null
      }
    })

    console.log(`[GHL OAuth] Tokens stored for company ${companyId}`)
  })
}

/**
 * Clear GHL OAuth tokens (on uninstall)
 */
export async function clearGHLOAuthTokens(companyId: string): Promise<void> {
  await withPrisma(async (prisma) => {
    await prisma.company.update({
      where: { id: companyId },
      data: {
        ghlOAuthAccessToken: null,
        ghlOAuthRefreshToken: null,
        ghlOAuthExpiresAt: null,
        ghlAppUninstalledAt: new Date()
      }
    })

    console.log(`[GHL OAuth] Tokens cleared for company ${companyId}`)
  })
}

/**
 * Check if company has GHL OAuth connected
 */
export async function isGHLOAuthConnected(companyId: string): Promise<boolean> {
  return await withPrisma(async (prisma) => {
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: {
        ghlOAuthAccessToken: true,
        ghlOAuthRefreshToken: true,
        ghlAppUninstalledAt: true
      }
    })

    return !!(
      company?.ghlOAuthAccessToken &&
      company?.ghlOAuthRefreshToken &&
      !company.ghlAppUninstalledAt
    )
  })
}

/**
 * Get GHL location ID for a company
 */
export async function getGHLLocationId(companyId: string): Promise<string | null> {
  return await withPrisma(async (prisma) => {
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { ghlLocationId: true }
    })

    return company?.ghlLocationId || null
  })
}

