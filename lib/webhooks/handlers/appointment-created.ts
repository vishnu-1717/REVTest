/**
 * Handle appointment created/confirmed webhook event
 */

import { GHLWebhookExtended, GHLCompany } from '@/types'
import { withPrisma } from '@/lib/db'
import { parseGHLDate } from '@/lib/webhooks/utils'
import { resolveAttribution } from '@/lib/attribution'
import { recalculateContactInclusionFlags } from '@/lib/appointment-inclusion-flag'
import { Calendar, User } from '@prisma/client'

type CalendarWithCloser = Calendar & { defaultCloser: User | null }

export async function handleAppointmentCreated(webhook: GHLWebhookExtended, company: GHLCompany) {
  console.log('[GHL Webhook] handleAppointmentCreated called with:', {
    appointmentId: webhook.appointmentId,
    contactId: webhook.contactId,
    companyId: company.id,
    startTime: webhook.startTime
  })

  await withPrisma(async (prisma) => {
    const timezone = company.timezone || 'UTC'
    const safeString = (value: unknown): string => (typeof value === 'string' ? value.trim() : '')
    const normalizeWhitespace = (value: string): string => value.replace(/\s+/g, ' ').trim()
    const normalizeName = (value: string): string =>
      normalizeWhitespace(
        value
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, ' ')
      )
    const normalizeEmail = (value: string): string => value.trim().toLowerCase()

    type NameCandidateMeta = {
      normalized: string
      raw: string
      hint?: 'setter' | 'closer'
      sources: Set<string>
    }

    type EmailCandidateMeta = {
      normalized: string
      raw: string
      sources: Set<string>
    }

    const collectAssigneeCandidates = () => {
      const nameCandidates = new Map<string, NameCandidateMeta>()
      const emailCandidates = new Map<string, EmailCandidateMeta>()

      const addNameCandidate = (value: unknown, source: string, key?: string) => {
        const raw = safeString(value)
        if (!raw) return
        const normalized = normalizeName(raw)
        if (!normalized) return
        const lowerKey = key?.toLowerCase() || ''
        let hint: 'setter' | 'closer' | undefined
        if (lowerKey.includes('setter') || lowerKey.includes('sdr')) {
          hint = 'setter'
        } else if (
          lowerKey.includes('closer') ||
          lowerKey.includes('assignee') ||
          lowerKey.includes('host') ||
          lowerKey.includes('owner') ||
          lowerKey.includes('advisor') ||
          lowerKey.includes('sales')
        ) {
          hint = 'closer'
        }

        const existing = nameCandidates.get(normalized)
        if (existing) {
          existing.sources.add(source)
          if (!existing.hint && hint) {
            existing.hint = hint
          }
        } else {
          nameCandidates.set(normalized, {
            normalized,
            raw,
            hint,
            sources: new Set([source])
          })
        }
      }

      const addEmailCandidate = (value: unknown, source: string) => {
        const raw = safeString(value)
        if (!raw) return
        const normalized = normalizeEmail(raw)
        if (!normalized) return
        const existing = emailCandidates.get(normalized)
        if (existing) {
          existing.sources.add(source)
        } else {
          emailCandidates.set(normalized, {
            normalized,
            raw,
            sources: new Set([source])
          })
        }
      }

      const processField = (key: string, value: unknown, source: string) => {
        if (typeof value !== 'string') return
        const lowerKey = key.toLowerCase()
        const isNameField = /(assignee|host|closer|rep|owner|advisor|coach|team|staff|sales|consultant|executive|agent)/i.test(lowerKey)
        const isEmailField =
          lowerKey.includes('email') &&
          (lowerKey.includes('assignee') ||
            lowerKey.includes('host') ||
            lowerKey.includes('user') ||
            lowerKey.includes('staff') ||
            lowerKey.includes('closer') ||
            lowerKey.includes('rep') ||
            lowerKey.includes('owner'))

        if (isNameField) {
          addNameCandidate(value, `${source}.${key}`, key)
        }
        if (isEmailField) {
          addEmailCandidate(value, `${source}.${key}`)
        }
      }

      const processObject = (obj: unknown, source: string) => {
        if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return
        Object.entries(obj as Record<string, unknown>).forEach(([key, value]) => {
          processField(key, value, source)
          const lowerKey = key.toLowerCase()
          if (
            value &&
            typeof value === 'object' &&
            !Array.isArray(value) &&
            (lowerKey.includes('user') || lowerKey.includes('assignee') || lowerKey.includes('host'))
          ) {
            processObject(value, `${source}.${key}`)
          }
        })
      }

      processObject(webhook.allCustomFields, 'payload')
      processObject(webhook.customFields, 'customFields')

      const payloadUser =
        (webhook.allCustomFields as Record<string, unknown> | undefined)?.user ||
        (webhook as unknown as Record<string, unknown>).user

      if (payloadUser && typeof payloadUser === 'object' && !Array.isArray(payloadUser)) {
        const userObj = payloadUser as Record<string, unknown>
        const userName = `${safeString(userObj.firstName)} ${safeString(userObj.lastName)}`.trim()
        if (userName) {
          addNameCandidate(userName, 'payload.user', 'user')
        }
        if (safeString(userObj.name)) {
          addNameCandidate(userObj.name, 'payload.user', 'user')
        }
        if (safeString(userObj.email)) {
          addEmailCandidate(userObj.email, 'payload.user')
        }
      }

      const calendlyAssignee = safeString(
        (webhook.allCustomFields as Record<string, unknown> | undefined)?.['Calendly Assignee']
      )
      if (calendlyAssignee) {
        addNameCandidate(calendlyAssignee, 'payload.Calendly Assignee', 'Calendly Assignee')
      }

      const calendlyHost = safeString(
        (webhook.allCustomFields as Record<string, unknown> | undefined)?.['Calendly Host']
      )
      if (calendlyHost) {
        addNameCandidate(calendlyHost, 'payload.Calendly Host', 'Calendly Host')
      }

      const calendlyAssignedTo = safeString(
        (webhook.allCustomFields as Record<string, unknown> | undefined)?.['Calendly Assigned To']
      )
      if (calendlyAssignedTo) {
        addNameCandidate(calendlyAssignedTo, 'payload.Calendly Assigned To', 'Calendly Assigned To')
      }

      const calendlyAssigneeEmail = safeString(
        (webhook.allCustomFields as Record<string, unknown> | undefined)?.['Calendly Assignee Email']
      )
      if (calendlyAssigneeEmail) {
        addEmailCandidate(calendlyAssigneeEmail, 'payload.Calendly Assignee Email')
      }

      return { nameCandidates, emailCandidates }
    }

    const resolveFallbackAssignee = async () => {
      const { nameCandidates, emailCandidates } = collectAssigneeCandidates()
      const contactNormalized = normalizeName(
        safeString(webhook.contactName) ||
          `${safeString(webhook.firstName)} ${safeString(webhook.lastName)}`.trim()
      )
      const normalizedTitle = normalizeName(safeString(webhook.title))
      const normalizedCalendarName = normalizeName(safeString(webhook.calendarName))

      if (
        nameCandidates.size === 0 &&
        emailCandidates.size === 0 &&
        !normalizedTitle &&
        !normalizedCalendarName
      ) {
        return null
      }

      const users = await prisma.user.findMany({
        where: {
          companyId: company.id,
          isActive: true
        }
      })

      const isContactName = (normalizedName: string) =>
        !!contactNormalized && normalizedName === contactNormalized

      for (const userCandidate of users) {
        const emailNorm = normalizeEmail(userCandidate.email || '')
        if (!emailNorm) continue
        const emailMeta = emailCandidates.get(emailNorm)
        if (emailMeta) {
          const assignment: 'setter' | 'closer' =
            userCandidate.role?.toLowerCase() === 'setter' ? 'setter' : 'closer'
          return {
            user: userCandidate,
            assignment,
            reason: `email match (${Array.from(emailMeta.sources).join(', ')})`
          }
        }
      }

      for (const userCandidate of users) {
        const normalizedCandidateName = normalizeName(userCandidate.name || '')
        if (!normalizedCandidateName || isContactName(normalizedCandidateName)) continue
        const nameMeta = nameCandidates.get(normalizedCandidateName)
        if (nameMeta) {
          const assignment: 'setter' | 'closer' =
            nameMeta.hint || (userCandidate.role?.toLowerCase() === 'setter' ? 'setter' : 'closer')
          return {
            user: userCandidate,
            assignment,
            reason: `name match (${Array.from(nameMeta.sources).join(', ')})`
          }
        }
      }

      const nameMetaList = Array.from(nameCandidates.values())
      if (nameMetaList.length > 0) {
        for (const userCandidate of users) {
          const normalizedCandidateName = normalizeName(userCandidate.name || '')
          if (!normalizedCandidateName || isContactName(normalizedCandidateName)) continue
          const candidateParts = normalizedCandidateName.split(' ').filter(Boolean)
          if (candidateParts.length === 0) continue

          for (const meta of nameMetaList) {
            if (meta.normalized === normalizedCandidateName) continue
            const metaParts = meta.normalized.split(' ').filter(Boolean)
            if (candidateParts.every((part) => metaParts.includes(part))) {
              const assignment: 'setter' | 'closer' =
                meta.hint ||
                (userCandidate.role?.toLowerCase() === 'setter' ? 'setter' : 'closer')
              return {
                user: userCandidate,
                assignment,
                reason: `partial name match (${Array.from(meta.sources).join(', ')})`
              }
            }
          }
        }
      }

      if (normalizedTitle || normalizedCalendarName) {
        for (const userCandidate of users) {
          const normalizedCandidateName = normalizeName(userCandidate.name || '')
          if (!normalizedCandidateName || isContactName(normalizedCandidateName)) continue
          const matchesTitle =
            normalizedTitle && normalizedTitle.includes(normalizedCandidateName)
          const matchesCalendar =
            normalizedCalendarName && normalizedCalendarName.includes(normalizedCandidateName)
          if (matchesTitle || matchesCalendar) {
            const assignment: 'setter' | 'closer' =
              userCandidate.role?.toLowerCase() === 'setter' ? 'setter' : 'closer'
            return {
              user: userCandidate,
              assignment,
              reason: matchesTitle
                ? 'title contained user name'
                : 'calendar name contained user name'
            }
          }
        }
      }

      return null
    }
  // Find or create contact
  let contact = await prisma.contact.findFirst({
    where: {
      companyId: company.id,
      ghlContactId: webhook.contactId
    }
  })

  console.log('[GHL Webhook] Found contact:', contact?.id, contact?.name)

  // Create or update contact from webhook data
  if (!contact && webhook.contactId) {
    const firstName = webhook.firstName || ''
    const lastName = webhook.lastName || ''
    let fullName = webhook.contactName || `${firstName} ${lastName}`.trim() || 'Unknown'
    let contactEmail = webhook.contactEmail
    let contactPhone = webhook.contactPhone

    // If name would be "Unknown", try to fetch from GHL API
    if (fullName === 'Unknown') {
      console.log('[GHL Webhook] Contact name is missing, fetching from GHL API...')
      try {
        const { createGHLClient } = await import('@/lib/ghl-api')
        const ghlClient = await createGHLClient(company.id)
        
        if (ghlClient) {
          const ghlContact = await ghlClient.getContact(webhook.contactId)
          
          if (ghlContact) {
            // Use name from GHL API
            const ghlName = ghlContact.name || 
                          (ghlContact.firstName && ghlContact.lastName 
                            ? `${ghlContact.firstName} ${ghlContact.lastName}`.trim()
                            : ghlContact.firstName || ghlContact.lastName)
            
            if (ghlName && ghlName !== 'Unknown') {
              fullName = ghlName
              console.log('[GHL Webhook] ✅ Fetched contact name from GHL API:', fullName)
            }
            
            // Also use email/phone from GHL if webhook doesn't have them
            if (!contactEmail && ghlContact.email) {
              contactEmail = ghlContact.email
            }
            if (!contactPhone && ghlContact.phone) {
              contactPhone = ghlContact.phone
            }
          } else {
            console.log('[GHL Webhook] ⚠️  Contact not found in GHL API')
          }
        } else {
          console.log('[GHL Webhook] ⚠️  GHL client not available, using "Unknown"')
        }
      } catch (error: any) {
        console.error('[GHL Webhook] Error fetching contact from GHL API:', error.message)
        // Continue with "Unknown" if fetch fails
      }
    }

    console.log('[GHL Webhook] Creating contact with name:', fullName, 'from', { firstName, lastName })

      contact = await prisma.contact.create({
        data: {
          companyId: company.id,
        ghlContactId: webhook.contactId,
        name: fullName,
        email: contactEmail,
        phone: contactPhone,
        tags: [],
        customFields: JSON.parse(JSON.stringify(webhook.allCustomFields || {}))
      }
    })
    console.log('[GHL Webhook] Contact created:', contact.id)
  } else if (contact) {
    // Update existing contact name if it's "Unknown"
    if (contact.name === 'Unknown') {
      // First try webhook data
      let fullName = webhook.contactName || `${webhook.firstName} ${webhook.lastName}`.trim()
      
      // If webhook doesn't have name, try fetching from GHL API
      if (!fullName || fullName === 'Unknown') {
        console.log('[GHL Webhook] Contact is "Unknown", fetching from GHL API...')
        try {
          const { createGHLClient } = await import('@/lib/ghl-api')
          const ghlClient = await createGHLClient(company.id)
          
          if (ghlClient && contact.ghlContactId) {
            const ghlContact = await ghlClient.getContact(contact.ghlContactId)
            
            if (ghlContact) {
              const ghlName = ghlContact.name || 
                            (ghlContact.firstName && ghlContact.lastName 
                              ? `${ghlContact.firstName} ${ghlContact.lastName}`.trim()
                              : ghlContact.firstName || ghlContact.lastName)
              
              if (ghlName && ghlName !== 'Unknown') {
                fullName = ghlName
                console.log('[GHL Webhook] ✅ Fetched contact name from GHL API:', fullName)
              }
            }
          }
        } catch (error: any) {
          console.error('[GHL Webhook] Error fetching contact from GHL API:', error.message)
        }
      }
      
      if (fullName && fullName !== 'Unknown') {
        console.log('[GHL Webhook] Updating contact name from "Unknown" to:', fullName)
        contact = await prisma.contact.update({
          where: { id: contact.id },
          data: {
            name: fullName,
            email: webhook.contactEmail || contact.email,
            phone: webhook.contactPhone || contact.phone
          }
        })
      }
    }
  }

  if (!contact) {
    console.error('[GHL Webhook] Could not create contact for appointment:', webhook.appointmentId)
    return
  }

  // Find calendar
  console.log('[GHL Webhook] Looking for calendar with ghlCalendarId:', webhook.calendarId || 'NONE')
  
  // Validate calendar ID format if provided
  if (webhook.calendarId && !/^[a-zA-Z0-9_-]+$/.test(webhook.calendarId)) {
    console.warn('[GHL Webhook] ⚠️ Calendar ID has invalid format:', webhook.calendarId)
    console.warn('[GHL Webhook] Expected format: alphanumeric, underscore, and dash characters only')
    console.warn('[GHL Webhook] This may cause lookup failures')
  }

  let calendar: CalendarWithCloser | null = null
  if (webhook.calendarId) {
    calendar = await prisma.calendar.findFirst({
      where: {
        companyId: company.id,
        ghlCalendarId: webhook.calendarId
      },
      include: { defaultCloser: true }
    })

    if (calendar) {
      console.log('[GHL Webhook] ✅ Found calendar by ID:', calendar.name)
      console.log('[GHL Webhook]   - ghlCalendarId:', calendar.ghlCalendarId)
      console.log('[GHL Webhook]   - isCloserCalendar:', calendar.isCloserCalendar)
    } else {
      console.warn('[GHL Webhook] ⚠️ Calendar not found by ID. ghlCalendarId:', webhook.calendarId)
      
      // FALLBACK: Try to find calendar by name if calendarName is available
      if (webhook.calendarName) {
        console.log('[GHL Webhook] 🔄 Attempting fallback: searching by calendar name')
        console.log('[GHL Webhook]   - Searching for calendar name:', webhook.calendarName)
        
        // Try exact name match first
        calendar = await prisma.calendar.findFirst({
          where: {
            companyId: company.id,
            name: webhook.calendarName,
            isCloserCalendar: true // Only approved calendars
          },
          include: { defaultCloser: true }
        })
        
        if (calendar) {
          console.log('[GHL Webhook] ✅ Found calendar by exact name match:', calendar.name)
          console.log('[GHL Webhook]   - ghlCalendarId:', calendar.ghlCalendarId)
          console.log('[GHL Webhook]   - isCloserCalendar:', calendar.isCloserCalendar)
          console.log('[GHL Webhook] ⚠️ WARNING: Calendar ID mismatch detected!')
          console.log('[GHL Webhook]   - Webhook calendarId:', webhook.calendarId)
          console.log('[GHL Webhook]   - Database calendarId:', calendar.ghlCalendarId)
          console.log('[GHL Webhook]   - This suggests the calendar ID may have changed in GHL')
        } else {
          // Try fuzzy name match (contains)
          console.log('[GHL Webhook] 🔄 Exact name match failed, trying fuzzy match')
          calendar = await prisma.calendar.findFirst({
            where: {
              companyId: company.id,
              name: {
                contains: webhook.calendarName,
                mode: 'insensitive'
              },
              isCloserCalendar: true // Only approved calendars
            },
            include: { defaultCloser: true }
          })
          
          if (calendar) {
            console.log('[GHL Webhook] ✅ Found calendar by fuzzy name match:', calendar.name)
            console.log('[GHL Webhook]   - ghlCalendarId:', calendar.ghlCalendarId)
            console.log('[GHL Webhook]   - isCloserCalendar:', calendar.isCloserCalendar)
            console.log('[GHL Webhook] ⚠️ WARNING: Calendar ID and name mismatch detected!')
            console.log('[GHL Webhook]   - Webhook calendarId:', webhook.calendarId)
            console.log('[GHL Webhook]   - Webhook calendarName:', webhook.calendarName)
            console.log('[GHL Webhook]   - Database calendarId:', calendar.ghlCalendarId)
            console.log('[GHL Webhook]   - Database calendarName:', calendar.name)
          }
        }
      }
      
      // If still no calendar found, show detailed error information
      if (!calendar) {
        console.warn('[GHL Webhook] Calendar must be synced and approved before appointments can be created.')
        console.warn('[GHL Webhook] Go to Admin > Calendars to sync and approve calendars.')
        console.warn('[GHL Webhook] Available calendars:')
        const allCalendars = await prisma.calendar.findMany({
          where: { companyId: company.id },
          select: { name: true, ghlCalendarId: true, isCloserCalendar: true }
        })
        if (allCalendars.length === 0) {
          console.warn('[GHL Webhook]   No calendars synced yet. Go to Admin > Calendars to sync calendars.')
        } else {
          allCalendars.forEach(c => 
            console.warn(`  - ${c.name} (${c.ghlCalendarId}) - Approved: ${c.isCloserCalendar ? 'Yes' : 'No'}`)
          )
        }
        
        // DO NOT auto-create calendars - require manual sync and approval
        console.log('[GHL Webhook] ❌ Rejecting appointment: Calendar not found and must be manually synced')
        return
      }
    }
  } else {
    console.log('[GHL Webhook] ⚠️ No calendarId in webhook payload')
    console.log('[GHL Webhook] Webhook payload analysis:')
    console.log('  - calendarId:', webhook.calendarId)
    console.log('  - calendarName:', webhook.calendarName)
    
    // Try to find calendar by name only if available
    if (webhook.calendarName) {
      console.log('[GHL Webhook] 🔄 Attempting to find calendar by name only')
      calendar = await prisma.calendar.findFirst({
        where: {
          companyId: company.id,
          name: {
            contains: webhook.calendarName,
            mode: 'insensitive'
          },
          isCloserCalendar: true // Only approved calendars
        },
        include: { defaultCloser: true }
      })
      
      if (calendar) {
        console.log('[GHL Webhook] ✅ Found calendar by name only:', calendar.name)
        console.log('[GHL Webhook]   - ghlCalendarId:', calendar.ghlCalendarId)
        console.log('[GHL Webhook] ⚠️ WARNING: Webhook missing calendarId but found by name')
      } else {
        console.log('[GHL Webhook] ❌ No calendar found by name either')
      }
    }
    
    if (!calendar) {
      console.log('[GHL Webhook] ❌ Rejecting appointment: No calendar information provided')
      console.log('[GHL Webhook] Available approved calendars:')
      const approvedCalendars = await prisma.calendar.findMany({
        where: { 
          companyId: company.id,
          isCloserCalendar: true 
        },
        select: { name: true, ghlCalendarId: true }
      })
      approvedCalendars.forEach(c => 
        console.log(`  - ${c.name} (${c.ghlCalendarId})`)
      )
      return
    }
  }

  // Check if calendar is approved for closer appointments
  if (!calendar.isCloserCalendar) {
    console.log('[GHL Webhook] ❌ Rejecting appointment: Calendar is not approved for closer appointments')
    console.log('[GHL Webhook]   Calendar details:')
    console.log('     - Name:', calendar.name)
    console.log('     - GHL Calendar ID:', calendar.ghlCalendarId)
    console.log('     - Is Closer Calendar:', calendar.isCloserCalendar)
    console.log('     - Traffic Source:', calendar.trafficSource)
    console.log('     - Calendar Type:', calendar.calendarType)
    console.log('     - Default Closer:', calendar.defaultCloser?.name || 'None')
    console.log('[GHL Webhook]   Action required: Go to Admin > Calendars to approve this calendar')
    console.log('[GHL Webhook]   Currently approved calendars:')
    
    const approvedCalendars = await prisma.calendar.findMany({
      where: { 
        companyId: company.id,
        isCloserCalendar: true 
      },
      select: { name: true, ghlCalendarId: true }
    })
    
    if (approvedCalendars.length === 0) {
      console.log('     - No calendars are currently approved')
    } else {
      approvedCalendars.forEach(c => 
        console.log(`     - ${c.name} (${c.ghlCalendarId})`)
      )
    }
    return
  }

  // Find setter and closer - intelligently determine which role
  let setter: User | null = null
  let closer: User | null = null

  console.log('[GHL Webhook] Determining setter vs closer assignment...')

  // Priority 1: Check if webhook specifies assignedUserId from GHL
  if (webhook.assignedUserId) {
    const assignedUser = await prisma.user.findFirst({
      where: {
        companyId: company.id,
        ghlUserId: webhook.assignedUserId,
        isActive: true // Only assign to active users
      }
    })

    if (assignedUser) {
      console.log('[GHL Webhook] Found assigned user:', assignedUser.name, 'Role:', assignedUser.role)

      // Determine role based on multiple signals:
      // 1. GHL custom fields that might indicate role
      const customFields = webhook.allCustomFields || webhook.customFields || {}
      const roleField = (customFields as Record<string, unknown>)['Role'] || (customFields as Record<string, unknown>)['Assignment Type'] || (customFields as Record<string, unknown>)['Team']

      // 2. Calendar type (e.g., "Setter Call" vs "Closer Call")
      const calendarHint = calendar?.calendarType?.toLowerCase() || ''
      const calendarName = calendar?.name?.toLowerCase() || ''

      // 3. User's role in the system
      const userRole = assignedUser.role?.toLowerCase() || ''

      // Determine if this is a SETTER
      const roleFieldStr = typeof roleField === 'string' ? roleField : ''
      const isSetter =
        roleFieldStr.toLowerCase().includes('setter') ||
        calendarHint.includes('setter') ||
        calendarName.includes('setter') ||
        userRole === 'setter'

      // Determine if this is a CLOSER
      const isCloser =
        roleFieldStr.toLowerCase().includes('closer') ||
        calendarHint.includes('closer') ||
        calendarName.includes('closer') ||
        userRole === 'closer'

      // Assign based on detected role
      if (isSetter) {
        setter = assignedUser
        console.log('[GHL Webhook] ✅ Assigned to SETTER:', setter.name)
      } else if (isCloser) {
        closer = assignedUser
        console.log('[GHL Webhook] ✅ Assigned to CLOSER:', closer.name)
      } else {
        // Default to closer if role unclear (most appointments are closer appointments)
        closer = assignedUser
        console.log('[GHL Webhook] ⚠️ Role unclear - defaulting to CLOSER:', closer.name)
      }
    }
  }

  // Note: We do NOT use calendar.defaultCloser - if no closer is found, appointment remains unassigned
  // This ensures appointments are only assigned to closers that are explicitly matched

  if (!closer || !setter) {
    const fallbackMatch = await resolveFallbackAssignee()
    if (fallbackMatch) {
      if (fallbackMatch.assignment === 'setter' && !setter) {
        setter = fallbackMatch.user
        console.log(
          '[GHL Webhook] ✅ Assigned to SETTER via fallback detection:',
          setter.name,
          `(${fallbackMatch.reason})`
        )
      } else if (!closer) {
        closer = fallbackMatch.user
        console.log(
          '[GHL Webhook] ✅ Assigned to CLOSER via fallback detection:',
          closer.name,
          `(${fallbackMatch.reason})`
        )
      }
    }
  }

  if (!closer) {
    const recentCloserAppointment = await prisma.appointment.findFirst({
      where: {
        contactId: contact.id,
        companyId: company.id,
        closerId: { not: null }
      },
      orderBy: {
        scheduledAt: 'desc'
      }
    })

    if (recentCloserAppointment?.closerId) {
      const recentCloser = await prisma.user.findUnique({ 
        where: { id: recentCloserAppointment.closerId },
        select: { id: true, name: true, isActive: true }
      })
      
      // Only use recent closer if they are still active
      if (recentCloser && recentCloser.isActive) {
        closer = recentCloser as User
        console.log('[GHL Webhook] ✅ Reusing recent closer for contact:', closer.name)
      } else if (recentCloser && !recentCloser.isActive) {
        console.log('[GHL Webhook] ⚠️ Recent closer is inactive, skipping assignment')
      }
    }
  }

  // Verify assigned closer is active (if a closer was assigned)
  if (closer && !closer.isActive) {
    console.log('[GHL Webhook] ⚠️ Assigned closer is inactive:', closer.name)
    console.log('[GHL Webhook] Setting closer to null (appointment will be unassigned)')
    closer = null
  }

  // Final validation: Calendar must be approved (already checked above, but double-check)
  if (!calendar || !calendar.isCloserCalendar) {
    console.log('[GHL Webhook] ❌ Final check failed: Calendar not approved')
    return
  }

  // Determine if this is first call (not a reschedule/follow-up)
  const isFirstCall = !calendar?.calendarType?.match(/reschedule|follow.?up/i)

    // Create or update appointment
    console.log('[GHL Webhook] Looking for existing appointment with ghlAppointmentId:', webhook.appointmentId)
    let appointment = await prisma.appointment.findFirst({
    where: {
        ghlAppointmentId: webhook.appointmentId,
        companyId: company.id
      }
    })

    console.log('[GHL Webhook] Existing appointment found:', !!appointment, appointment?.id)

    // Parse dates from webhook (use parsed date if available, otherwise parse raw string)
    console.log('[GHL Webhook] Raw date values from webhook:')
    console.log('  - webhook.startTime:', webhook.startTime)
    console.log('  - webhook.startTimeParsed:', webhook.startTimeParsed)
    console.log('  - webhook.endTime:', webhook.endTime)
    console.log('  - timezone:', timezone)
    
    const startTimeDate =
      webhook.startTimeParsed ||
      parseGHLDate(webhook.startTime, timezone) ||
      (webhook.startTime ? parseGHLDate(webhook.startTime, 'UTC') : null) ||
      new Date(webhook.startTime || Date.now())
    const endTimeDate =
      webhook.endTimeParsed ||
      (webhook.endTime ? parseGHLDate(webhook.endTime, timezone) : null)

    console.log('[GHL Webhook] Parsed dates:')
    console.log('  - startTimeDate:', startTimeDate.toISOString(), `(${startTimeDate.toLocaleString('en-US', { timeZone: timezone })})`)
    console.log('  - endTimeDate:', endTimeDate?.toISOString() || 'null', endTimeDate ? `(${endTimeDate.toLocaleString('en-US', { timeZone: timezone })})` : '')
    
    // Warn if the parsed date seems wrong (e.g., in the past when it should be future)
    if (startTimeDate && startTimeDate < new Date()) {
      const hoursAgo = (Date.now() - startTimeDate.getTime()) / (1000 * 60 * 60)
      if (hoursAgo > 24) {
        console.warn(`[GHL Webhook] ⚠️  WARNING: Parsed startTime is ${hoursAgo.toFixed(1)} hours in the past. This might be incorrect.`)
        console.warn(`[GHL Webhook]   Raw startTime value: "${webhook.startTime}"`)
        console.warn(`[GHL Webhook]   Parsed as: ${startTimeDate.toISOString()}`)
      }
    }

    if (appointment) {
      // Update existing appointment
      appointment = await prisma.appointment.update({
        where: { id: appointment.id },
        data: {
          scheduledAt: startTimeDate,
          startTime: startTimeDate,
          endTime: endTimeDate,
          setterId: setter?.id,
          closerId: closer?.id,
          calendarId: calendar?.id,
          calendar: calendar?.name || null, // Populate old calendar field for backward compatibility
          notes: webhook.notes || webhook.title || undefined,
          customFields: JSON.parse(JSON.stringify(webhook.customFields || {})),
          // Ensure PCN is still available if not submitted
          pcnSubmitted: appointment.pcnSubmitted || false
        }
      })
    } else {
      // Create new appointment
      appointment = await prisma.appointment.create({
        data: {
      companyId: company.id,
      contactId: contact.id,
      setterId: setter?.id,
      closerId: closer?.id,
      calendarId: calendar?.id,
      calendar: calendar?.name || null, // Populate old calendar field for backward compatibility

      ghlAppointmentId: webhook.appointmentId,
      scheduledAt: startTimeDate,
      startTime: startTimeDate,
      endTime: endTimeDate,

      status: 'scheduled',
      isFirstCall,
      pcnSubmitted: false, // PCN is automatically "created" when appointment exists

      notes: webhook.notes,
      customFields: JSON.parse(JSON.stringify(webhook.customFields || {}))
        }
      })
    }

  // Resolve attribution
  const attribution = await resolveAttribution(appointment.id)

  // Update appointment with attribution
  await prisma.appointment.update({
    where: { id: appointment.id },
    data: {
      attributionSource: attribution.trafficSource,
      leadSource: attribution.leadSource,
      customFields: JSON.parse(JSON.stringify({
          ...(appointment.customFields as Record<string, unknown> || {}),
        attributionConfidence: attribution.confidence
      }))
    }
  })

  console.log('[GHL Webhook] ✅ Appointment created:', appointment.id)
  console.log('[GHL Webhook]   - Setter:', setter?.name || 'None')
  console.log('[GHL Webhook]   - Closer:', closer?.name || 'None')
  console.log('[GHL Webhook]   - Calendar:', calendar?.name || 'None')
  console.log('[GHL Webhook]   - Attribution:', attribution.trafficSource || 'None')

  // Calculate inclusion flag for this appointment and all appointments for this contact
  try {
    await recalculateContactInclusionFlags(contact.id, company.id)
    console.log('[GHL Webhook] ✅ Calculated inclusion flags for contact')
  } catch (flagError) {
    console.error('[GHL Webhook] Error calculating inclusion flag:', flagError)
    // Don't fail the webhook if flag calculation fails
  }
  })
}

