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
    const fullName = webhook.contactName || `${firstName} ${lastName}`.trim() || 'Unknown'

    console.log('[GHL Webhook] Creating contact with name:', fullName, 'from', { firstName, lastName })

      contact = await prisma.contact.create({
        data: {
          companyId: company.id,
        ghlContactId: webhook.contactId,
        name: fullName,
        email: webhook.contactEmail,
        phone: webhook.contactPhone,
        tags: [],
        customFields: JSON.parse(JSON.stringify(webhook.allCustomFields || {}))
      }
    })
    console.log('[GHL Webhook] Contact created:', contact.id)
  } else if (contact) {
    // Update existing contact name if it's "Unknown"
    if (contact.name === 'Unknown' && webhook.contactName) {
      const fullName = webhook.contactName || `${webhook.firstName} ${webhook.lastName}`.trim()
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
      console.log('[GHL Webhook] ✅ Found calendar:', calendar.name)
    } else {
      console.warn('[GHL Webhook] ⚠️ Calendar not found in database. ghlCalendarId:', webhook.calendarId)
      console.warn('[GHL Webhook] Available calendars:')
      const allCalendars = await prisma.calendar.findMany({
        where: { companyId: company.id },
        select: { name: true, ghlCalendarId: true }
      })
      if (allCalendars.length === 0) {
        console.warn('[GHL Webhook]   No calendars synced yet. Go to GHL setup to sync calendars.')
      } else {
        allCalendars.forEach(c => console.warn(`  - ${c.name} (${c.ghlCalendarId})`))
      }

      // Auto-create calendar if we have both ID and name from webhook
      if (webhook.calendarId && webhook.calendarName) {
        console.log('[GHL Webhook] 🆕 Auto-creating missing calendar:', webhook.calendarName)
        try {
          calendar = await prisma.calendar.create({
            data: {
              companyId: company.id,
              ghlCalendarId: webhook.calendarId,
              name: webhook.calendarName,
              isActive: true
            },
            include: { defaultCloser: true }
          })
          console.log('[GHL Webhook] ✅ Calendar auto-created successfully')
        } catch (createError) {
          const errorMessage = createError instanceof Error ? createError.message : 'Unknown error'
          console.error('[GHL Webhook] Failed to auto-create calendar:', errorMessage)
          const existingCalendar = await prisma.calendar.findFirst({
            where: {
              companyId: company.id,
              ghlCalendarId: webhook.calendarId
            },
            include: { defaultCloser: true }
          })
          if (existingCalendar) {
            calendar = existingCalendar
            console.log('[GHL Webhook] ✅ Using existing calendar after conflict')
          }
        }
      } else {
        console.log('[GHL Webhook] Cannot auto-create calendar - missing calendarId or calendarName')
      }
    }
  } else {
    console.log('[GHL Webhook] ⚠️ No calendarId in webhook payload - appointment will not be linked to a calendar')
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
        ghlUserId: webhook.assignedUserId
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

  // Priority 2: Use calendar's default closer if no closer assigned yet
  if (!setter && !closer && calendar?.defaultCloser) {
    closer = calendar.defaultCloser
    console.log('[GHL Webhook] ✅ Using calendar default CLOSER:', closer.name)
  }

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
      closer = await prisma.user.findUnique({ where: { id: recentCloserAppointment.closerId } }) || null
      if (closer) {
        console.log('[GHL Webhook] ✅ Reusing recent closer for contact:', closer.name)
      }
    }
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
    const startTimeDate =
      webhook.startTimeParsed ||
      parseGHLDate(webhook.startTime, timezone) ||
      (webhook.startTime ? parseGHLDate(webhook.startTime, 'UTC') : null) ||
      new Date(webhook.startTime || Date.now())
    const endTimeDate =
      webhook.endTimeParsed ||
      (webhook.endTime ? parseGHLDate(webhook.endTime, timezone) : null)

    console.log('[GHL Webhook] Parsed dates - startTime:', startTimeDate, 'endTime:', endTimeDate)

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
