import { Webhook } from 'svix'
import { headers } from 'next/headers'
import { WebhookEvent } from '@clerk/nextjs/server'
import { withPrisma } from '@/lib/db'
import { DEFAULT_COMPANY_EMAIL } from '@/lib/constants'

export async function POST(req: Request) {
  const WEBHOOK_SECRET = process.env.CLERK_WEBHOOK_SECRET

  if (!WEBHOOK_SECRET) {
    throw new Error('Missing CLERK_WEBHOOK_SECRET')
  }

  const headerPayload = await headers()
  const svix_id = headerPayload.get('svix-id')
  const svix_timestamp = headerPayload.get('svix-timestamp')
  const svix_signature = headerPayload.get('svix-signature')

  if (!svix_id || !svix_timestamp || !svix_signature) {
    return new Response('Error: Missing svix headers', { status: 400 })
  }

  const payload = await req.json()
  const body = JSON.stringify(payload)

  const wh = new Webhook(WEBHOOK_SECRET)

  let evt: WebhookEvent

  try {
    evt = wh.verify(body, {
      'svix-id': svix_id,
      'svix-timestamp': svix_timestamp,
      'svix-signature': svix_signature,
    }) as WebhookEvent
  } catch (err) {
    console.error('Error verifying webhook:', err)
    return new Response('Error: Verification error', { status: 400 })
  }

  const { id, email_addresses, first_name, last_name, public_metadata } = evt.data as any
  const eventType = evt.type
  const metadata = (public_metadata || {}) as Record<string, unknown>
  const companyIdFromMetadata = typeof metadata.companyId === 'string' ? metadata.companyId : null
  const invitedByUserId = typeof metadata.invitedByUserId === 'string' ? metadata.invitedByUserId : null
  const nowIso = new Date().toISOString()

  if (eventType === 'user.created') {
    // When a user signs up, we need to link them to existing User record
    // or create new one
    
    const email = email_addresses[0]?.email_address
    
    if (email) {
      await withPrisma(async (prisma) => {
        // Try to find existing user by email
        const existingUser = await prisma.user.findFirst({
          where: { email }
        })
        
        if (existingUser) {
          const existingCustomFields = (existingUser.customFields as any) || {}
          const existingInvitation = (existingCustomFields?.invitation as any) || {}
          // Link Clerk ID to existing user
          await prisma.user.update({
            where: { id: existingUser.id },
            data: {
              clerkId: id, // Update clerkId field directly
              isActive: true,
              customFields: {
                ...existingCustomFields,
                clerkId: id, // Also keep in customFields for backward compatibility
                invitation: {
                  ...existingInvitation,
                  status: 'accepted',
                  acceptedAt: nowIso,
                  invitedBy: invitedByUserId ?? existingInvitation?.invitedBy ?? null
                }
              }
            }
          })
        } else {
          // Find or create a default company
          let targetCompany = null
          
          if (companyIdFromMetadata) {
            targetCompany = await prisma.company.findUnique({
              where: { id: companyIdFromMetadata }
            })
          }
          
          if (!targetCompany) {
            targetCompany = await prisma.company.findFirst({
              where: { email: DEFAULT_COMPANY_EMAIL }
            })
          }

          if (!targetCompany) {
            targetCompany = await prisma.company.create({
              data: {
                name: 'Default Company',
                email: DEFAULT_COMPANY_EMAIL,
                processor: 'whop'
              }
            })
          }
          
          // Create new user record
          await prisma.user.create({
            data: {
              email,
              name: `${first_name || ''} ${last_name || ''}`.trim() || email.split('@')[0],
              role: 'user',
              companyId: targetCompany.id,
              clerkId: id, // Set clerkId directly
              customFields: {
                clerkId: id, // Also keep in customFields for backward compatibility
                invitation: {
                  status: 'accepted',
                  acceptedAt: nowIso,
                  invitedBy: invitedByUserId ?? null
                }
              }
            }
          })
        }
      })
    }
  }

  return new Response('', { status: 200 })
}
