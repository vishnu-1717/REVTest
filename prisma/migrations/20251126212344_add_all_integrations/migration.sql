-- CreateTable
CREATE TABLE "Commission" (
    "id" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "percentage" DECIMAL(5,2),
    "status" TEXT NOT NULL DEFAULT 'pending',
    "releasedAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "releaseStatus" TEXT NOT NULL DEFAULT 'pending',
    "overrideAmount" DECIMAL(10,2),
    "overrideReason" TEXT,
    "overrideByUserId" TEXT,
    "calculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "saleId" TEXT NOT NULL,
    "repId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,

    CONSTRAINT "Commission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Company" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "processor" TEXT NOT NULL,
    "processorAccountId" TEXT,
    "processorConnectedAt" TIMESTAMP(3),
    "inviteCode" TEXT,
    "ghlApiKey" TEXT,
    "ghlLocationId" TEXT,
    "ghlWebhookSecret" TEXT,
    "ghlOAuthAccessToken" TEXT,
    "ghlOAuthRefreshToken" TEXT,
    "ghlOAuthExpiresAt" TIMESTAMP(3),
    "ghlAppInstalledAt" TIMESTAMP(3),
    "ghlAppUninstalledAt" TIMESTAMP(3),
    "ghlMarketplaceClientId" TEXT,
    "ghlMarketplaceWebhookSecret" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "attributionStrategy" TEXT NOT NULL DEFAULT 'ghl_fields',
    "attributionSourceField" TEXT DEFAULT 'contact.source',
    "useCalendarsForAttribution" BOOLEAN NOT NULL DEFAULT false,
    "downsellOpportunities" JSONB,
    "zoomAccountId" TEXT,
    "zoomClientId" TEXT,
    "zoomClientSecret" TEXT,
    "zoomAccessToken" TEXT,
    "zoomRefreshToken" TEXT,
    "zoomTokenExpiresAt" TIMESTAMP(3),
    "zoomConnectedAt" TIMESTAMP(3),
    "zoomWebhookSecret" TEXT,
    "zoomAutoSubmitPCN" BOOLEAN NOT NULL DEFAULT false,
    "slackWorkspaceId" TEXT,
    "slackWorkspaceName" TEXT,
    "slackBotToken" TEXT,
    "slackAppId" TEXT,
    "slackClientId" TEXT,
    "slackClientSecret" TEXT,
    "slackSigningSecret" TEXT,
    "slackConnectedAt" TIMESTAMP(3),
    "slackChannelId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Calendar" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "ghlCalendarId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "trafficSource" TEXT,
    "calendarType" TEXT,
    "isCloserCalendar" BOOLEAN NOT NULL DEFAULT false,
    "defaultCloserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Calendar_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sale" (
    "id" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "status" TEXT NOT NULL,
    "processor" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "processorFees" DECIMAL(10,2),
    "netAmount" DECIMAL(10,2),
    "source" TEXT,
    "customerEmail" TEXT,
    "customerName" TEXT,
    "rawData" JSONB,
    "paidAt" TIMESTAMP(3),
    "paymentType" TEXT,
    "totalAmount" DOUBLE PRECISION,
    "remainingAmount" DOUBLE PRECISION,
    "matchedBy" TEXT,
    "matchConfidence" DOUBLE PRECISION,
    "manuallyMatched" BOOLEAN NOT NULL DEFAULT false,
    "matchedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "repId" TEXT,
    "contactId" TEXT,
    "companyId" TEXT NOT NULL,
    "paymentLinkId" TEXT,
    "appointmentId" TEXT,

    CONSTRAINT "Sale_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "superAdmin" BOOLEAN NOT NULL DEFAULT false,
    "clerkId" TEXT,
    "companyId" TEXT NOT NULL,
    "commissionRoleId" TEXT,
    "customCommissionRate" DOUBLE PRECISION,
    "canViewTeamMetrics" BOOLEAN NOT NULL DEFAULT false,
    "canViewLeaderboard" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "customFields" JSONB,
    "ghlUserId" TEXT,
    "slackUserId" TEXT,
    "slackUserName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookEvent" (
    "id" TEXT NOT NULL,
    "processor" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "companyId" TEXT,
    "payload" JSONB NOT NULL,
    "processed" BOOLEAN NOT NULL DEFAULT false,
    "processedAt" TIMESTAMP(3),
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contact" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "companyId" TEXT NOT NULL,
    "ghlContactId" TEXT,
    "customFields" JSONB,
    "tags" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "trafficSourceId" TEXT,

    CONSTRAINT "Contact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrafficSource" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "monthlyCost" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrafficSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Appointment" (
    "id" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "startTime" TIMESTAMP(3),
    "endTime" TIMESTAMP(3),
    "companyId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "closerId" TEXT,
    "setterId" TEXT,
    "trafficSourceId" TEXT,
    "calendar" TEXT,
    "status" TEXT NOT NULL,
    "outcome" TEXT,
    "objectionType" TEXT,
    "objectionNotes" TEXT,
    "notes" TEXT,
    "isFirstCall" BOOLEAN NOT NULL DEFAULT true,
    "duration" INTEGER,
    "recordingUrl" TEXT,
    "followUpScheduled" BOOLEAN NOT NULL DEFAULT false,
    "followUpDate" TIMESTAMP(3),
    "nurtureType" TEXT,
    "qualificationStatus" TEXT,
    "disqualificationReason" TEXT,
    "cashCollected" DOUBLE PRECISION,
    "saleId" TEXT,
    "ghlAppointmentId" TEXT,
    "customFields" JSONB,
    "calendarId" TEXT,
    "attributionSource" TEXT,
    "leadSource" TEXT,
    "pcnSubmitted" BOOLEAN NOT NULL DEFAULT false,
    "pcnSubmittedAt" TIMESTAMP(3),
    "pcnSubmittedByUserId" TEXT,
    "firstCallOrFollowUp" TEXT,
    "wasOfferMade" BOOLEAN,
    "whyDidntMoveForward" TEXT,
    "notMovingForwardNotes" TEXT,
    "noShowCommunicative" TEXT,
    "noShowCommunicativeNotes" TEXT,
    "cancellationReason" TEXT,
    "cancellationNotes" TEXT,
    "signedNotes" TEXT,
    "paymentPlanOrPIF" TEXT,
    "totalPrice" DOUBLE PRECISION,
    "numberOfPayments" INTEGER,
    "zoomMeetingId" TEXT,
    "zoomMeetingUuid" TEXT,
    "zoomTranscript" TEXT,
    "zoomTranscriptAnalyzedAt" TIMESTAMP(3),
    "downsellOpportunity" TEXT,
    "whyNoOffer" TEXT,
    "whyNoOfferNotes" TEXT,
    "didCallAndText" BOOLEAN,
    "rescheduledTo" TIMESTAMP(3),
    "rescheduledFrom" TIMESTAMP(3),
    "appointmentInclusionFlag" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Appointment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PCNChangelog" (
    "id" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actorUserId" TEXT,
    "actorName" TEXT,
    "changes" JSONB,
    "previousData" JSONB,
    "newData" JSONB,
    "notes" TEXT,
    "source" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PCNChangelog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIQuery" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT,
    "query" TEXT NOT NULL,
    "intent" TEXT,
    "answer" TEXT,
    "sql" TEXT,
    "sources" JSONB,
    "data" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AIQuery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommissionRole" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "defaultRate" DOUBLE PRECISION NOT NULL,
    "description" TEXT,
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommissionRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentLink" (
    "id" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "opens" INTEGER NOT NULL DEFAULT 0,
    "lastOpenedAt" TIMESTAMP(3),
    "amount" DOUBLE PRECISION NOT NULL,
    "paymentType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UnmatchedPayment" (
    "id" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "suggestedMatches" JSONB,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "reviewedAt" TIMESTAMP(3),
    "reviewedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UnmatchedPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SlackMessage" (
    "id" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "slackChannelId" TEXT,
    "slackMessageTs" TEXT,
    "slackThreadTs" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "messageContent" TEXT,
    "closerId" TEXT,
    "closerName" TEXT,
    "contactName" TEXT,
    "contactEmail" TEXT,
    "scheduledAt" TIMESTAMP(3),
    "channelType" TEXT,
    "errorMessage" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "sentAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SlackMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Commission_saleId_key" ON "Commission"("saleId");

-- CreateIndex
CREATE INDEX "Commission_companyId_idx" ON "Commission"("companyId");

-- CreateIndex
CREATE INDEX "Commission_repId_idx" ON "Commission"("repId");

-- CreateIndex
CREATE INDEX "Commission_status_idx" ON "Commission"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Company_email_key" ON "Company"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Company_inviteCode_key" ON "Company"("inviteCode");

-- CreateIndex
CREATE INDEX "Company_email_idx" ON "Company"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Calendar_ghlCalendarId_key" ON "Calendar"("ghlCalendarId");

-- CreateIndex
CREATE INDEX "Calendar_companyId_idx" ON "Calendar"("companyId");

-- CreateIndex
CREATE INDEX "Calendar_ghlCalendarId_idx" ON "Calendar"("ghlCalendarId");

-- CreateIndex
CREATE INDEX "Calendar_trafficSource_idx" ON "Calendar"("trafficSource");

-- CreateIndex
CREATE UNIQUE INDEX "Sale_externalId_key" ON "Sale"("externalId");

-- CreateIndex
CREATE INDEX "Sale_companyId_idx" ON "Sale"("companyId");

-- CreateIndex
CREATE INDEX "Sale_externalId_idx" ON "Sale"("externalId");

-- CreateIndex
CREATE INDEX "Sale_paidAt_idx" ON "Sale"("paidAt");

-- CreateIndex
CREATE INDEX "Sale_repId_idx" ON "Sale"("repId");

-- CreateIndex
CREATE INDEX "Sale_status_idx" ON "Sale"("status");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_clerkId_key" ON "User"("clerkId");

-- CreateIndex
CREATE UNIQUE INDEX "User_ghlUserId_key" ON "User"("ghlUserId");

-- CreateIndex
CREATE INDEX "User_companyId_idx" ON "User"("companyId");

-- CreateIndex
CREATE INDEX "User_email_idx" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_ghlUserId_idx" ON "User"("ghlUserId");

-- CreateIndex
CREATE INDEX "WebhookEvent_createdAt_idx" ON "WebhookEvent"("createdAt");

-- CreateIndex
CREATE INDEX "WebhookEvent_processed_idx" ON "WebhookEvent"("processed");

-- CreateIndex
CREATE INDEX "WebhookEvent_processor_eventType_idx" ON "WebhookEvent"("processor", "eventType");

-- CreateIndex
CREATE INDEX "WebhookEvent_companyId_idx" ON "WebhookEvent"("companyId");

-- CreateIndex
CREATE INDEX "Contact_companyId_email_idx" ON "Contact"("companyId", "email");

-- CreateIndex
CREATE INDEX "Contact_ghlContactId_idx" ON "Contact"("ghlContactId");

-- CreateIndex
CREATE INDEX "TrafficSource_companyId_idx" ON "TrafficSource"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "Appointment_saleId_key" ON "Appointment"("saleId");

-- CreateIndex
CREATE INDEX "Appointment_companyId_idx" ON "Appointment"("companyId");

-- CreateIndex
CREATE INDEX "Appointment_closerId_idx" ON "Appointment"("closerId");

-- CreateIndex
CREATE INDEX "Appointment_setterId_idx" ON "Appointment"("setterId");

-- CreateIndex
CREATE INDEX "Appointment_status_idx" ON "Appointment"("status");

-- CreateIndex
CREATE INDEX "Appointment_ghlAppointmentId_idx" ON "Appointment"("ghlAppointmentId");

-- CreateIndex
CREATE INDEX "Appointment_calendarId_idx" ON "Appointment"("calendarId");

-- CreateIndex
CREATE INDEX "Appointment_attributionSource_idx" ON "Appointment"("attributionSource");

-- CreateIndex
CREATE INDEX "Appointment_pcnSubmitted_idx" ON "Appointment"("pcnSubmitted");

-- CreateIndex
CREATE INDEX "Appointment_pcnSubmittedAt_idx" ON "Appointment"("pcnSubmittedAt");

-- CreateIndex
CREATE INDEX "Appointment_appointmentInclusionFlag_idx" ON "Appointment"("appointmentInclusionFlag");

-- CreateIndex
CREATE INDEX "Appointment_contactId_scheduledAt_idx" ON "Appointment"("contactId", "scheduledAt");

-- CreateIndex
CREATE INDEX "Appointment_companyId_pcnSubmitted_status_scheduledAt_idx" ON "Appointment"("companyId", "pcnSubmitted", "status", "scheduledAt");

-- CreateIndex
CREATE INDEX "PCNChangelog_appointmentId_idx" ON "PCNChangelog"("appointmentId");

-- CreateIndex
CREATE INDEX "PCNChangelog_companyId_idx" ON "PCNChangelog"("companyId");

-- CreateIndex
CREATE INDEX "PCNChangelog_action_idx" ON "PCNChangelog"("action");

-- CreateIndex
CREATE INDEX "PCNChangelog_createdAt_idx" ON "PCNChangelog"("createdAt");

-- CreateIndex
CREATE INDEX "PCNChangelog_companyId_appointmentId_createdAt_idx" ON "PCNChangelog"("companyId", "appointmentId", "createdAt");

-- CreateIndex
CREATE INDEX "AIQuery_companyId_idx" ON "AIQuery"("companyId");

-- CreateIndex
CREATE INDEX "AIQuery_userId_idx" ON "AIQuery"("userId");

-- CreateIndex
CREATE INDEX "AIQuery_createdAt_idx" ON "AIQuery"("createdAt");

-- CreateIndex
CREATE INDEX "AIQuery_companyId_createdAt_idx" ON "AIQuery"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "CommissionRole_companyId_idx" ON "CommissionRole"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "CommissionRole_companyId_name_key" ON "CommissionRole"("companyId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentLink_token_key" ON "PaymentLink"("token");

-- CreateIndex
CREATE INDEX "PaymentLink_token_idx" ON "PaymentLink"("token");

-- CreateIndex
CREATE INDEX "PaymentLink_appointmentId_idx" ON "PaymentLink"("appointmentId");

-- CreateIndex
CREATE UNIQUE INDEX "UnmatchedPayment_saleId_key" ON "UnmatchedPayment"("saleId");

-- CreateIndex
CREATE INDEX "UnmatchedPayment_companyId_status_idx" ON "UnmatchedPayment"("companyId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "SlackMessage_appointmentId_key" ON "SlackMessage"("appointmentId");

-- CreateIndex
CREATE INDEX "SlackMessage_companyId_idx" ON "SlackMessage"("companyId");

-- CreateIndex
CREATE INDEX "SlackMessage_appointmentId_idx" ON "SlackMessage"("appointmentId");

-- CreateIndex
CREATE INDEX "SlackMessage_status_idx" ON "SlackMessage"("status");

-- CreateIndex
CREATE INDEX "SlackMessage_createdAt_idx" ON "SlackMessage"("createdAt");

-- CreateIndex
CREATE INDEX "SlackMessage_status_createdAt_idx" ON "SlackMessage"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "Commission" ADD CONSTRAINT "Commission_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Commission" ADD CONSTRAINT "Commission_repId_fkey" FOREIGN KEY ("repId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Commission" ADD CONSTRAINT "Commission_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Calendar" ADD CONSTRAINT "Calendar_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Calendar" ADD CONSTRAINT "Calendar_defaultCloserId_fkey" FOREIGN KEY ("defaultCloserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_repId_fkey" FOREIGN KEY ("repId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_paymentLinkId_fkey" FOREIGN KEY ("paymentLinkId") REFERENCES "PaymentLink"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_commissionRoleId_fkey" FOREIGN KEY ("commissionRoleId") REFERENCES "CommissionRole"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookEvent" ADD CONSTRAINT "WebhookEvent_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_trafficSourceId_fkey" FOREIGN KEY ("trafficSourceId") REFERENCES "TrafficSource"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrafficSource" ADD CONSTRAINT "TrafficSource_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_calendarId_fkey" FOREIGN KEY ("calendarId") REFERENCES "Calendar"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_pcnSubmittedByUserId_fkey" FOREIGN KEY ("pcnSubmittedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_closerId_fkey" FOREIGN KEY ("closerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_setterId_fkey" FOREIGN KEY ("setterId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_trafficSourceId_fkey" FOREIGN KEY ("trafficSourceId") REFERENCES "TrafficSource"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PCNChangelog" ADD CONSTRAINT "PCNChangelog_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PCNChangelog" ADD CONSTRAINT "PCNChangelog_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PCNChangelog" ADD CONSTRAINT "PCNChangelog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIQuery" ADD CONSTRAINT "AIQuery_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIQuery" ADD CONSTRAINT "AIQuery_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionRole" ADD CONSTRAINT "CommissionRole_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentLink" ADD CONSTRAINT "PaymentLink_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentLink" ADD CONSTRAINT "PaymentLink_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnmatchedPayment" ADD CONSTRAINT "UnmatchedPayment_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnmatchedPayment" ADD CONSTRAINT "UnmatchedPayment_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SlackMessage" ADD CONSTRAINT "SlackMessage_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SlackMessage" ADD CONSTRAINT "SlackMessage_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

