/**
 * Application constants and configuration
 * These values can be overridden by environment variables
 */

// Super admin emails - users with these emails get automatic super admin access
export const SUPER_ADMIN_EMAILS = process.env.SUPER_ADMIN_EMAILS?.split(',').map(e => e.trim()) || [
  'ben@systemizedsales.com',
  'dylan@automatedrev.com',
  'jake@systemizedsales.com'
]

// Default company email - fallback company for new user creation
export const DEFAULT_COMPANY_EMAIL = process.env.DEFAULT_COMPANY_EMAIL || 'default@revphlo.com'

// Allowed emails for super admin operations
export const MAKE_SUPER_ADMIN_ALLOWED_EMAILS = process.env.MAKE_SUPER_ADMIN_ALLOWED_EMAILS?.split(',').map(e => e.trim()) || [
  'ben@systemizedsales.com'
]
