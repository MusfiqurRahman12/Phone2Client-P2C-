# Phone2Client (P2C) — Database Schema

> **Version**: 1.0.0-draft  
> **Status**: In Review  
> **Last Updated**: 2026-07-08  
> **Author**: Principal Architect  
> **Companions**: [PRD](file:///d:/AI/Phone2Client%20-%20P2C/docs/01-PRD.md) | [Architecture](file:///d:/AI/Phone2Client%20-%20P2C/docs/02-system-architecture.md)

---

## 1. Overview

### 1.1 Tenancy Strategy
All tenant-scoped tables carry a non-nullable `workspace_id UUID` foreign key. This enables row-level isolation enforced at **three layers**: ORM (Prisma), application (guard/interceptor), and database (PostgreSQL RLS).

### 1.2 Design Principles
- Every table has `id UUID DEFAULT gen_random_uuid()` as primary key
- Every table has `created_at` and `updated_at` timestamps
- Soft-delete via `deleted_at TIMESTAMPTZ` on all major entities
- All monetary values stored as `BIGINT` (cents/microcents — never FLOAT)
- Phone numbers stored in **E.164 format** (`+15551234567`)
- Enum types defined in PostgreSQL for type safety
- JSONB for extensible metadata blobs (never for queried fields)

### 1.3 Entity Relationship Overview

```
users ──────────────────┐
  │                     │
  │ (many-to-many)      │ (one-to-many)
  ▼                     ▼
workspace_members ──► workspaces
                          │
              ┌───────────┼───────────┐
              │           │           │
              ▼           ▼           ▼
         phone_numbers  contacts  billing_accounts
              │                       │
              │                       ▼
              │                  usage_records
              │
     ┌────────┼────────┐
     │        │        │
     ▼        ▼        ▼
  call_logs  conversations  voicemails
                  │
                  ▼
             messages
```

---

## 2. Prisma Schema

```prisma
// prisma/schema.prisma
// Phone2Client (P2C) - Database Schema v1.0.0

generator client {
  provider        = "prisma-client-js"
  previewFeatures = ["relationJoins", "nativeDistinct"]
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ─────────────────────────────────────────────────────────────────────────────
// ENUMS
// ─────────────────────────────────────────────────────────────────────────────

enum UserStatus {
  PENDING_VERIFICATION
  ACTIVE
  SUSPENDED
  DELETED
}

enum WorkspaceRole {
  OWNER
  ADMIN
  MEMBER
}

enum WorkspaceStatus {
  ACTIVE
  SUSPENDED
  DELETED
}

enum PhoneNumberType {
  LOCAL
  TOLL_FREE
  MOBILE
}

enum PhoneNumberStatus {
  ACTIVE
  PORTING
  SUSPENDED
  RELEASED
}

enum RingStrategy {
  SIMULTANEOUS   // Ring all assigned members at once
  SEQUENTIAL     // Ring members one at a time in order
  ROUND_ROBIN    // Distribute calls evenly
}

enum CallDirection {
  INBOUND
  OUTBOUND
}

enum CallStatus {
  INITIATED
  RINGING
  ANSWERED
  COMPLETED
  MISSED
  VOICEMAIL
  FAILED
  CANCELLED
}

enum MessageDirection {
  INBOUND
  OUTBOUND
}

enum MessageStatus {
  QUEUED
  SENDING
  SENT
  DELIVERED
  READ
  FAILED
  UNDELIVERED
}

enum MessageType {
  SMS
  MMS
}

enum VoicemailStatus {
  RECORDING
  AVAILABLE
  TRANSCRIBING
  TRANSCRIBED
  DELETED
}

enum InvitationStatus {
  PENDING
  ACCEPTED
  EXPIRED
  CANCELLED
}

enum BillingPlan {
  FREE
  PRO
  ENTERPRISE
}

enum UsageType {
  CALL_INBOUND_MINUTE
  CALL_OUTBOUND_MINUTE
  SMS_OUTBOUND
  SMS_INBOUND
  MMS_OUTBOUND
  MMS_INBOUND
  PHONE_NUMBER_MONTHLY
  VOICEMAIL_TRANSCRIPTION
  RECORDING_MINUTE
  STORAGE_GB
}

enum TokenType {
  EMAIL_VERIFICATION
  PASSWORD_RESET
  WORKSPACE_INVITATION
}

enum ApiKeyStatus {
  ACTIVE
  REVOKED
}

enum TelephonyProvider {
  TELNYX
  TWILIO
}

// ─────────────────────────────────────────────────────────────────────────────
// USERS & AUTH
// ─────────────────────────────────────────────────────────────────────────────

model User {
  id              String     @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  email           String     @unique @db.VarChar(320)
  emailVerifiedAt DateTime?  @map("email_verified_at")
  passwordHash    String     @map("password_hash") @db.VarChar(255)
  firstName       String     @map("first_name") @db.VarChar(100)
  lastName        String     @map("last_name") @db.VarChar(100)
  avatarUrl       String?    @map("avatar_url") @db.VarChar(500)
  phoneNumber     String?    @map("phone_number") @db.VarChar(20) // Personal phone
  status          UserStatus @default(PENDING_VERIFICATION)
  totpSecret      String?    @map("totp_secret") @db.VarChar(255)  // Encrypted
  totpEnabledAt   DateTime?  @map("totp_enabled_at")
  lastLoginAt     DateTime?  @map("last_login_at")
  lastLoginIp     String?    @map("last_login_ip") @db.VarChar(45) // IPv6 max length
  metadata        Json?      @db.JsonB
  createdAt       DateTime   @default(now()) @map("created_at")
  updatedAt       DateTime   @updatedAt @map("updated_at")
  deletedAt       DateTime?  @map("deleted_at")

  // Relations
  workspaceMembers   WorkspaceMember[]
  tokens             Token[]
  apiKeys            ApiKey[]
  refreshTokens      RefreshToken[]
  auditLogs          AuditLog[]

  @@index([email])
  @@index([status])
  @@map("users")
}

model RefreshToken {
  id          String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  userId      String   @map("user_id") @db.Uuid
  tokenHash   String   @unique @map("token_hash") @db.VarChar(255) // SHA-256 of token
  family      String   @db.Uuid      // Token family for rotation (reuse detection)
  expiresAt   DateTime @map("expires_at")
  revokedAt   DateTime? @map("revoked_at")
  userAgent   String?  @map("user_agent") @db.VarChar(500)
  ipAddress   String?  @map("ip_address") @db.VarChar(45)
  createdAt   DateTime @default(now()) @map("created_at")

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@index([tokenHash])
  @@index([family])
  @@map("refresh_tokens")
}

model Token {
  id        String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  userId    String    @map("user_id") @db.Uuid
  type      TokenType
  tokenHash String    @unique @map("token_hash") @db.VarChar(255)
  expiresAt DateTime  @map("expires_at")
  usedAt    DateTime? @map("used_at")
  createdAt DateTime  @default(now()) @map("created_at")

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId, type])
  @@index([tokenHash])
  @@map("tokens")
}

model ApiKey {
  id          String       @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  userId      String       @map("user_id") @db.Uuid
  workspaceId String       @map("workspace_id") @db.Uuid
  name        String       @db.VarChar(255)
  keyHash     String       @unique @map("key_hash") @db.VarChar(255) // SHA-256
  keyPrefix   String       @map("key_prefix") @db.VarChar(12)        // "p2c_sk_abc12..."
  status      ApiKeyStatus @default(ACTIVE)
  lastUsedAt  DateTime?    @map("last_used_at")
  expiresAt   DateTime?    @map("expires_at")
  scopes      String[]     @default([]) // e.g. ["calls:read", "messages:write"]
  createdAt   DateTime     @default(now()) @map("created_at")
  revokedAt   DateTime?    @map("revoked_at")

  user      User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  workspace Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@index([workspaceId])
  @@index([keyHash])
  @@map("api_keys")
}

// ─────────────────────────────────────────────────────────────────────────────
// WORKSPACE (TENANT)
// ─────────────────────────────────────────────────────────────────────────────

model Workspace {
  id               String              @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  name             String              @db.VarChar(255)
  slug             String              @unique @db.VarChar(100) // URL-safe identifier
  status           WorkspaceStatus     @default(ACTIVE)
  plan             BillingPlan         @default(FREE)
  timezone         String              @default("UTC") @db.VarChar(100)
  businessHours    Json?               @map("business_hours") @db.JsonB
  // {
  //   "monday": { "open": "09:00", "close": "17:00", "enabled": true },
  //   ...
  // }
  logoUrl          String?             @map("logo_url") @db.VarChar(500)
  website          String?             @db.VarChar(500)

  // Telephony provider selection (per workspace)
  telephonyProvider TelephonyProvider  @default(TELNYX) @map("telephony_provider")

  // Stripe
  stripeCustomerId  String?            @unique @map("stripe_customer_id") @db.VarChar(255)

  createdAt   DateTime  @default(now()) @map("created_at")
  updatedAt   DateTime  @updatedAt @map("updated_at")
  deletedAt   DateTime? @map("deleted_at")
  suspendedAt DateTime? @map("suspended_at")

  // Relations
  members           WorkspaceMember[]
  invitations       WorkspaceInvitation[]
  phoneNumbers      PhoneNumber[]
  contacts          Contact[]
  conversations     Conversation[]
  callLogs          CallLog[]
  voicemails        Voicemail[]
  billingAccount    BillingAccount?
  usageRecords      UsageRecord[]
  apiKeys           ApiKey[]
  auditLogs         AuditLog[]
  webhooks          WebhookEndpoint[]
  notificationPrefs NotificationPreference[]
  providerConfig    WorkspaceProviderConfig?

  @@index([slug])
  @@index([status])
  @@index([telephonyProvider])
  @@index([stripeCustomerId])
  @@map("workspaces")
}

// Provider-specific credentials and resource IDs, stored separately
// to keep Workspace lean and to facilitate per-provider encryption.
model WorkspaceProviderConfig {
  id          String            @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  workspaceId String            @unique @map("workspace_id") @db.Uuid
  provider    TelephonyProvider

  // Telnyx-specific (encrypted at rest via application-level encryption)
  telnyxApiKey             String? @map("telnyx_api_key") @db.VarChar(512)       // AES-256 encrypted
  telnyxMessagingProfileId String? @map("telnyx_messaging_profile_id") @db.VarChar(255)
  telnyxConnectionId       String? @map("telnyx_connection_id") @db.VarChar(255)  // Voice connection
  telnyxAppId              String? @map("telnyx_app_id") @db.VarChar(255)         // TeXML App
  telnyxSipCredentialId    String? @map("telnyx_sip_credential_id") @db.VarChar(255)

  // Twilio-specific (encrypted at rest via application-level encryption)
  twilioAccountSid          String? @map("twilio_account_sid") @db.VarChar(255)   // AES-256 encrypted
  twilioAuthToken           String? @map("twilio_auth_token") @db.VarChar(512)    // AES-256 encrypted
  twilioMessagingServiceSid String? @map("twilio_messaging_service_sid") @db.VarChar(255)
  twilioTwimlAppSid         String? @map("twilio_twiml_app_sid") @db.VarChar(255)
  twilioSubaccountSid       String? @map("twilio_subaccount_sid") @db.VarChar(255) // optional billing isolation

  createdAt DateTime  @default(now()) @map("created_at")
  updatedAt DateTime  @updatedAt @map("updated_at")

  workspace Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)

  @@index([workspaceId])
  @@index([provider])
  @@map("workspace_provider_configs")
}

model WorkspaceMember {
  id          String        @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  workspaceId String        @map("workspace_id") @db.Uuid
  userId      String        @map("user_id") @db.Uuid
  role        WorkspaceRole @default(MEMBER)
  displayName String?       @map("display_name") @db.VarChar(255) // Override for this workspace
  isAvailable Boolean       @default(true) @map("is_available") // For call routing
  joinedAt    DateTime      @default(now()) @map("joined_at")
  updatedAt   DateTime      @updatedAt @map("updated_at")

  workspace Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  user      User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  
  // Number assignments for this member
  phoneNumberAssignments PhoneNumberAssignment[]
  notificationPrefs      NotificationPreference[]

  @@unique([workspaceId, userId])
  @@index([workspaceId])
  @@index([userId])
  @@map("workspace_members")
}

model WorkspaceInvitation {
  id          String           @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  workspaceId String           @map("workspace_id") @db.Uuid
  email       String           @db.VarChar(320)
  role        WorkspaceRole    @default(MEMBER)
  status      InvitationStatus @default(PENDING)
  invitedById String           @map("invited_by_id") @db.Uuid
  tokenHash   String           @unique @map("token_hash") @db.VarChar(255)
  expiresAt   DateTime         @map("expires_at")
  acceptedAt  DateTime?        @map("accepted_at")
  createdAt   DateTime         @default(now()) @map("created_at")

  workspace Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)

  @@index([workspaceId])
  @@index([email])
  @@index([tokenHash])
  @@map("workspace_invitations")
}

// ─────────────────────────────────────────────────────────────────────────────
// PHONE NUMBERS
// ─────────────────────────────────────────────────────────────────────────────

model PhoneNumber {
  id                String            @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  workspaceId       String            @map("workspace_id") @db.Uuid
  number            String            @db.VarChar(20)   // E.164 format: +15551234567
  friendlyName      String?           @map("friendly_name") @db.VarChar(255)
  type              PhoneNumberType
  status            PhoneNumberStatus @default(ACTIVE)
  countryCode       String            @map("country_code") @db.VarChar(2)   // ISO 3166-1 alpha-2
  areaCode          String?           @map("area_code") @db.VarChar(10)
  ringStrategy      RingStrategy      @default(SIMULTANEOUS) @map("ring_strategy")
  ringTimeout       Int               @default(30) @map("ring_timeout") // seconds
  greetingUrl       String?           @map("greeting_url") @db.VarChar(500) // S3 URL
  voicemailGreetingUrl String?        @map("voicemail_greeting_url") @db.VarChar(500)

  // Provider-agnostic IDs — populated by whichever provider owns this number
  provider          TelephonyProvider @map("provider")  // which provider owns this number
  providerNumberId  String?           @unique @map("provider_number_id") @db.VarChar(255)  // Telnyx number_id or Twilio SID
  providerOrderId   String?           @map("provider_order_id") @db.VarChar(255)           // Telnyx order_id or Twilio order SID

  capabilities      Json              @default("{}") @db.JsonB
  // { "voice": true, "sms": true, "mms": true, "fax": false }

  monthlyRenewsAt   DateTime?         @map("monthly_renews_at")
  releasedAt        DateTime?         @map("released_at")
  createdAt         DateTime          @default(now()) @map("created_at")
  updatedAt         DateTime          @updatedAt @map("updated_at")

  workspace     Workspace               @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  assignments   PhoneNumberAssignment[]
  callLogs      CallLog[]
  conversations Conversation[]
  voicemails    Voicemail[]

  @@unique([workspaceId, number])
  @@index([workspaceId])
  @@index([number])
  @@index([providerNumberId])
  @@index([provider])
  @@map("phone_numbers")
}

model PhoneNumberAssignment {
  id            String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  phoneNumberId String   @map("phone_number_id") @db.Uuid
  memberId      String   @map("member_id") @db.Uuid
  priority      Int      @default(0) // For sequential routing order
  assignedAt    DateTime @default(now()) @map("assigned_at")

  phoneNumber PhoneNumber     @relation(fields: [phoneNumberId], references: [id], onDelete: Cascade)
  member      WorkspaceMember @relation(fields: [memberId], references: [id], onDelete: Cascade)

  @@unique([phoneNumberId, memberId])
  @@index([phoneNumberId])
  @@index([memberId])
  @@map("phone_number_assignments")
}

// ─────────────────────────────────────────────────────────────────────────────
// CONTACTS
// ─────────────────────────────────────────────────────────────────────────────

model Contact {
  id          String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  workspaceId String    @map("workspace_id") @db.Uuid
  firstName   String?   @map("first_name") @db.VarChar(100)
  lastName    String?   @map("last_name") @db.VarChar(100)
  company     String?   @db.VarChar(255)
  email       String?   @db.VarChar(320)
  notes       String?   @db.Text
  avatarUrl   String?   @map("avatar_url") @db.VarChar(500)
  tags        String[]  @default([])
  isBlocked   Boolean   @default(false) @map("is_blocked")
  metadata    Json?     @db.JsonB  // External CRM IDs, custom fields
  createdAt   DateTime  @default(now()) @map("created_at")
  updatedAt   DateTime  @updatedAt @map("updated_at")
  deletedAt   DateTime? @map("deleted_at")

  workspace      Workspace      @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  phoneNumbers   ContactPhone[]
  conversations  Conversation[]
  callLogs       CallLog[]

  @@index([workspaceId])
  @@index([workspaceId, lastName, firstName])
  @@index([workspaceId, company])
  @@map("contacts")
}

model ContactPhone {
  id        String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  contactId String   @map("contact_id") @db.Uuid
  number    String   @db.VarChar(20) // E.164
  label     String?  @db.VarChar(50) // "mobile", "work", "home"
  isPrimary Boolean  @default(false) @map("is_primary")
  createdAt DateTime @default(now()) @map("created_at")

  contact Contact @relation(fields: [contactId], references: [id], onDelete: Cascade)

  @@unique([contactId, number])
  @@index([contactId])
  @@index([number])
  @@map("contact_phones")
}

// ─────────────────────────────────────────────────────────────────────────────
// CALLS
// ─────────────────────────────────────────────────────────────────────────────

model CallLog {
  id              String        @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  workspaceId     String        @map("workspace_id") @db.Uuid
  phoneNumberId   String        @map("phone_number_id") @db.Uuid
  contactId       String?       @map("contact_id") @db.Uuid
  direction       CallDirection
  status          CallStatus    @default(INITIATED)
  fromNumber      String        @map("from_number") @db.VarChar(20) // E.164
  toNumber        String        @map("to_number") @db.VarChar(20)   // E.164
  answeredById    String?       @map("answered_by_id") @db.Uuid     // workspace_members.id
  
  startedAt       DateTime      @default(now()) @map("started_at")
  answeredAt      DateTime?     @map("answered_at")
  endedAt         DateTime?     @map("ended_at")
  durationSeconds Int?          @map("duration_seconds")
  billableDuration Int?         @map("billable_duration") // May differ from duration (rounding)
  
  // Telnyx
  telnyxCallId    String?       @unique @map("telnyx_call_id") @db.VarChar(255)
  telnyxCallControlId String?   @map("telnyx_call_control_id") @db.VarChar(255)
  
  // Recording (Phase 2)
  recordingUrl    String?       @map("recording_url") @db.VarChar(500)
  recordingDuration Int?        @map("recording_duration")
  
  // Cost tracking (microdollars — avoids float precision issues)
  costMicrodollars BigInt       @default(0) @map("cost_microdollars")
  
  metadata        Json?         @db.JsonB
  createdAt       DateTime      @default(now()) @map("created_at")
  updatedAt       DateTime      @updatedAt @map("updated_at")

  workspace   Workspace   @relation(fields: [workspaceId], references: [id])
  phoneNumber PhoneNumber @relation(fields: [phoneNumberId], references: [id])
  contact     Contact?    @relation(fields: [contactId], references: [id])
  voicemail   Voicemail?

  @@index([workspaceId])
  @@index([workspaceId, startedAt(sort: Desc)])
  @@index([workspaceId, direction])
  @@index([workspaceId, status])
  @@index([workspaceId, fromNumber])
  @@index([workspaceId, toNumber])
  @@index([telnyxCallId])
  @@map("call_logs")
}

// ─────────────────────────────────────────────────────────────────────────────
// MESSAGING
// ─────────────────────────────────────────────────────────────────────────────

model Conversation {
  id              String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  workspaceId     String    @map("workspace_id") @db.Uuid
  phoneNumberId   String    @map("phone_number_id") @db.Uuid
  contactId       String?   @map("contact_id") @db.Uuid
  externalNumber  String    @map("external_number") @db.VarChar(20) // E.164 of other party
  isArchived      Boolean   @default(false) @map("is_archived")
  isSpam          Boolean   @default(false) @map("is_spam")
  unreadCount     Int       @default(0) @map("unread_count")
  lastMessageAt   DateTime? @map("last_message_at")
  lastMessageBody String?   @map("last_message_body") @db.VarChar(500) // Preview
  createdAt       DateTime  @default(now()) @map("created_at")
  updatedAt       DateTime  @updatedAt @map("updated_at")

  workspace   Workspace   @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  phoneNumber PhoneNumber @relation(fields: [phoneNumberId], references: [id])
  contact     Contact?    @relation(fields: [contactId], references: [id])
  messages    Message[]

  @@unique([workspaceId, phoneNumberId, externalNumber])
  @@index([workspaceId])
  @@index([workspaceId, lastMessageAt(sort: Desc)])
  @@index([workspaceId, phoneNumberId])
  @@map("conversations")
}

model Message {
  id              String          @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  workspaceId     String          @map("workspace_id") @db.Uuid
  conversationId  String          @map("conversation_id") @db.Uuid
  direction       MessageDirection
  type            MessageType     @default(SMS)
  status          MessageStatus   @default(QUEUED)
  fromNumber      String          @map("from_number") @db.VarChar(20)
  toNumber        String          @map("to_number") @db.VarChar(20)
  body            String?         @db.Text
  sentById        String?         @map("sent_by_id") @db.Uuid // workspace_members.id for outbound
  
  // Telnyx
  telnyxMessageId String?         @unique @map("telnyx_message_id") @db.VarChar(255)
  
  errorCode       String?         @map("error_code") @db.VarChar(50)
  errorMessage    String?         @map("error_message") @db.VarChar(500)
  
  sentAt          DateTime?       @map("sent_at")
  deliveredAt     DateTime?       @map("delivered_at")
  readAt          DateTime?       @map("read_at")
  
  // Cost
  costMicrodollars BigInt         @default(0) @map("cost_microdollars")
  segmentCount     Int            @default(1) @map("segment_count") // SMS segments
  
  createdAt  DateTime @default(now()) @map("created_at")
  updatedAt  DateTime @updatedAt @map("updated_at")

  conversation Conversation  @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  media        MessageMedia[]

  @@index([workspaceId])
  @@index([conversationId, createdAt(sort: Desc)])
  @@index([telnyxMessageId])
  @@map("messages")
}

model MessageMedia {
  id          String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  messageId   String   @map("message_id") @db.Uuid
  url         String   @db.VarChar(500)      // S3/Telnyx URL
  contentType String   @map("content_type") @db.VarChar(100)
  sizeBytes   Int?     @map("size_bytes")
  filename    String?  @db.VarChar(255)
  createdAt   DateTime @default(now()) @map("created_at")

  message Message @relation(fields: [messageId], references: [id], onDelete: Cascade)

  @@index([messageId])
  @@map("message_media")
}

// ─────────────────────────────────────────────────────────────────────────────
// VOICEMAIL
// ─────────────────────────────────────────────────────────────────────────────

model Voicemail {
  id              String          @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  workspaceId     String          @map("workspace_id") @db.Uuid
  callLogId       String          @unique @map("call_log_id") @db.Uuid
  phoneNumberId   String          @map("phone_number_id") @db.Uuid
  fromNumber      String          @map("from_number") @db.VarChar(20)
  status          VoicemailStatus @default(RECORDING)
  recordingUrl    String?         @map("recording_url") @db.VarChar(500)
  durationSeconds Int?            @map("duration_seconds")
  transcription   String?         @db.Text
  transcribedAt   DateTime?       @map("transcribed_at")
  isRead          Boolean         @default(false) @map("is_read")
  readAt          DateTime?       @map("read_at")
  telnyxRecordingId String?       @map("telnyx_recording_id") @db.VarChar(255)
  createdAt       DateTime        @default(now()) @map("created_at")
  updatedAt       DateTime        @updatedAt @map("updated_at")
  deletedAt       DateTime?       @map("deleted_at")

  workspace   Workspace   @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  callLog     CallLog     @relation(fields: [callLogId], references: [id])
  phoneNumber PhoneNumber @relation(fields: [phoneNumberId], references: [id])

  @@index([workspaceId])
  @@index([workspaceId, isRead])
  @@index([workspaceId, createdAt(sort: Desc)])
  @@map("voicemails")
}

// ─────────────────────────────────────────────────────────────────────────────
// BILLING
// ─────────────────────────────────────────────────────────────────────────────

model BillingAccount {
  id              String      @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  workspaceId     String      @unique @map("workspace_id") @db.Uuid
  plan            BillingPlan @default(FREE)
  
  // Credit balance (microdollars: 1 USD = 1,000,000 microdollars)
  balanceMicrodollars   BigInt  @default(0) @map("balance_microdollars")
  
  // Auto-reload settings
  autoReloadEnabled     Boolean @default(false) @map("auto_reload_enabled")
  autoReloadThreshold   BigInt  @default(0) @map("auto_reload_threshold")   // Trigger below this
  autoReloadAmount      BigInt  @default(0) @map("auto_reload_amount")      // Add this much
  
  // Spending limits
  monthlyLimitMicrodollars BigInt? @map("monthly_limit_microdollars")
  
  // Stripe
  stripeCustomerId      String? @map("stripe_customer_id") @db.VarChar(255)
  stripeDefaultPaymentMethodId String? @map("stripe_default_payment_method_id") @db.VarChar(255)
  
  currentPeriodStart  DateTime? @map("current_period_start")
  currentPeriodEnd    DateTime? @map("current_period_end")
  planActivatedAt     DateTime? @map("plan_activated_at")
  
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  workspace     Workspace      @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  transactions  BillingTransaction[]
  invoices      Invoice[]

  @@map("billing_accounts")
}

model BillingTransaction {
  id               String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  billingAccountId String   @map("billing_account_id") @db.Uuid
  workspaceId      String   @map("workspace_id") @db.Uuid
  type             String   @db.VarChar(50)  // "credit_purchase", "usage_deduction", "refund"
  amountMicrodollars BigInt @map("amount_microdollars") // + for credits, - for usage
  balanceAfterMicrodollars BigInt @map("balance_after_microdollars")
  description      String   @db.VarChar(500)
  stripePaymentIntentId String? @map("stripe_payment_intent_id") @db.VarChar(255)
  metadata         Json?    @db.JsonB
  createdAt        DateTime @default(now()) @map("created_at")

  billingAccount BillingAccount @relation(fields: [billingAccountId], references: [id])

  @@index([billingAccountId])
  @@index([workspaceId, createdAt(sort: Desc)])
  @@map("billing_transactions")
}

model UsageRecord {
  id                String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  workspaceId       String    @map("workspace_id") @db.Uuid
  type              UsageType
  quantity          Int       @default(1)
  unitCostMicrodollars BigInt @map("unit_cost_microdollars") // Telnyx cost per unit
  totalCostMicrodollars BigInt @map("total_cost_microdollars")
  resourceId        String?   @map("resource_id") @db.Uuid // call_log_id, message_id, etc.
  resourceType      String?   @map("resource_type") @db.VarChar(50) // "call", "message", etc.
  billedAt          DateTime? @map("billed_at")
  recordedAt        DateTime  @default(now()) @map("recorded_at")
  metadata          Json?     @db.JsonB

  workspace Workspace @relation(fields: [workspaceId], references: [id])

  @@index([workspaceId])
  @@index([workspaceId, recordedAt(sort: Desc)])
  @@index([workspaceId, type])
  @@index([resourceId])
  @@map("usage_records")
}

model Invoice {
  id               String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  billingAccountId String   @map("billing_account_id") @db.Uuid
  workspaceId      String   @map("workspace_id") @db.Uuid
  invoiceNumber    String   @unique @map("invoice_number") @db.VarChar(50)
  periodStart      DateTime @map("period_start")
  periodEnd        DateTime @map("period_end")
  amountMicrodollars BigInt @map("amount_microdollars")
  pdfUrl           String?  @map("pdf_url") @db.VarChar(500)
  stripeInvoiceId  String?  @map("stripe_invoice_id") @db.VarChar(255)
  paidAt           DateTime? @map("paid_at")
  createdAt        DateTime @default(now()) @map("created_at")

  billingAccount BillingAccount @relation(fields: [billingAccountId], references: [id])

  @@index([billingAccountId])
  @@index([workspaceId])
  @@map("invoices")
}

// ─────────────────────────────────────────────────────────────────────────────
// NOTIFICATIONS & WEBHOOKS
// ─────────────────────────────────────────────────────────────────────────────

model NotificationPreference {
  id          String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  workspaceId String   @map("workspace_id") @db.Uuid
  memberId    String   @map("member_id") @db.Uuid
  
  // In-app
  incomingCall    Boolean @default(true) @map("incoming_call")
  missedCall      Boolean @default(true) @map("missed_call")
  newVoicemail    Boolean @default(true) @map("new_voicemail")
  newMessage      Boolean @default(true) @map("new_message")
  
  // Email
  emailMissedCall   Boolean @default(true) @map("email_missed_call")
  emailNewVoicemail Boolean @default(true) @map("email_new_voicemail")
  emailNewMessage   Boolean @default(false) @map("email_new_message")
  
  // Push (browser)
  pushEnabled Boolean @default(false) @map("push_enabled")
  pushToken   String? @map("push_token") @db.Text
  
  updatedAt DateTime @updatedAt @map("updated_at")

  workspace Workspace       @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  member    WorkspaceMember @relation(fields: [memberId], references: [id], onDelete: Cascade)

  @@unique([workspaceId, memberId])
  @@map("notification_preferences")
}

model WebhookEndpoint {
  id          String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  workspaceId String   @map("workspace_id") @db.Uuid
  url         String   @db.VarChar(500)
  secret      String   @db.VarChar(255) // HMAC signing secret (encrypted at rest)
  events      String[] // ["call.completed", "message.received", ...]
  isActive    Boolean  @default(true) @map("is_active")
  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @updatedAt @map("updated_at")

  workspace     Workspace        @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  deliveries    WebhookDelivery[]

  @@index([workspaceId])
  @@map("webhook_endpoints")
}

model WebhookDelivery {
  id                String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  webhookEndpointId String   @map("webhook_endpoint_id") @db.Uuid
  eventType         String   @map("event_type") @db.VarChar(100)
  payload           Json     @db.JsonB
  responseStatus    Int?     @map("response_status")
  responseBody      String?  @map("response_body") @db.Text
  attemptCount      Int      @default(1) @map("attempt_count")
  success           Boolean  @default(false)
  nextRetryAt       DateTime? @map("next_retry_at")
  createdAt         DateTime @default(now()) @map("created_at")
  deliveredAt       DateTime? @map("delivered_at")

  endpoint WebhookEndpoint @relation(fields: [webhookEndpointId], references: [id], onDelete: Cascade)

  @@index([webhookEndpointId])
  @@map("webhook_deliveries")
}

// ─────────────────────────────────────────────────────────────────────────────
// AUDIT LOG
// ─────────────────────────────────────────────────────────────────────────────

model AuditLog {
  id          String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  workspaceId String?  @map("workspace_id") @db.Uuid  // null for global events
  userId      String?  @map("user_id") @db.Uuid
  action      String   @db.VarChar(100) // "workspace.member.invited", "phone_number.purchased"
  resourceType String? @map("resource_type") @db.VarChar(50)
  resourceId  String?  @map("resource_id") @db.Uuid
  ipAddress   String?  @map("ip_address") @db.VarChar(45)
  userAgent   String?  @map("user_agent") @db.VarChar(500)
  metadata    Json?    @db.JsonB        // Before/after for updates
  createdAt   DateTime @default(now()) @map("created_at")

  workspace Workspace? @relation(fields: [workspaceId], references: [id])
  user      User?      @relation(fields: [userId], references: [id])

  @@index([workspaceId, createdAt(sort: Desc)])
  @@index([userId])
  @@index([action])
  @@map("audit_logs")
}
```

---

## 3. Index Strategy

### 3.1 Critical Indexes

| Table | Index | Query Pattern |
|-------|-------|---------------|
| `users` | `email` | Login lookup |
| `workspace_members` | `(workspace_id, user_id)` UNIQUE | Auth + member validation |
| `phone_numbers` | `number` | Telnyx webhook routing (hot path) |
| `phone_numbers` | `telnyx_number_id` | Telnyx event correlation |
| `call_logs` | `(workspace_id, started_at DESC)` | Call history pagination |
| `call_logs` | `telnyx_call_id` | Webhook event correlation |
| `conversations` | `(workspace_id, last_message_at DESC)` | Inbox sorting |
| `conversations` | `(workspace_id, phone_number_id, external_number)` UNIQUE | Find/create |
| `messages` | `(conversation_id, created_at DESC)` | Message pagination |
| `messages` | `telnyx_message_id` | Delivery status webhook |
| `refresh_tokens` | `token_hash` | Token validation on every refresh |
| `refresh_tokens` | `family` | Token family rotation |

### 3.2 Full-Text Search

```sql
-- Contact search (name, company, phone)
CREATE INDEX contacts_fts_idx ON contacts
  USING GIN (
    to_tsvector('english', 
      COALESCE(first_name, '') || ' ' || 
      COALESCE(last_name, '') || ' ' || 
      COALESCE(company, '')
    )
  );

-- Message content search (within a workspace)
CREATE INDEX messages_body_fts_idx ON messages
  USING GIN (to_tsvector('english', COALESCE(body, '')));
```

---

## 4. Row-Level Security (RLS)

Applied as a defense-in-depth measure. Application layer is primary enforcement.

```sql
-- Enable RLS on all tenant-scoped tables
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE call_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE voicemails ENABLE ROW LEVEL SECURITY;
ALTER TABLE phone_numbers ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_records ENABLE ROW LEVEL SECURITY;

-- Application sets this at the start of each transaction
-- SET LOCAL app.current_workspace_id = 'uuid-here';

-- Example policy (repeat for each table)
CREATE POLICY tenant_isolation_contacts ON contacts
  USING (workspace_id = current_setting('app.current_workspace_id', TRUE)::uuid);
```

---

## 5. Migration Strategy

### 5.1 Principles
1. **Always forward** — never write down migrations for data migrations
2. **Zero-downtime** — use `DEFAULT`, index concurrently, avoid locks > 1 second
3. **Idempotent seeds** — seed scripts use `upsert` (`createOrUpdate`)
4. **Shadow database** — Prisma uses shadow DB for migration generation; required in config

### 5.2 Safe Migration Patterns

| Change | Safe? | Notes |
|--------|-------|-------|
| Add nullable column | ✅ | No lock needed |
| Add column with DEFAULT | ✅ | Use Prisma migration |
| Add NOT NULL without DEFAULT | ❌ | Add nullable first, backfill, add constraint |
| Add index | ✅ | Use `CREATE INDEX CONCURRENTLY` |
| Rename column | ❌ | Add new column, dual-write, deprecate old |
| Drop column | ❌ (careful) | Mark deleted first in code, then drop |
| Change column type | ❌ | New column + migration |

### 5.3 Migration File Naming
```
YYYYMMDDHHMMSS_descriptive_name.sql
# Examples:
20260708120000_initial_schema.sql
20260710090000_add_telnyx_app_id_to_workspaces.sql
```

---

## 6. Seed Data

```typescript
// prisma/seed.ts — Development seed

// System defaults
const systemData = {
  plans: ['FREE', 'PRO', 'ENTERPRISE'],
  defaultTimezone: 'America/New_York',
  defaultRingTimeout: 30,
};

// Dev workspace
const devWorkspace = {
  name: 'Acme Corp (Dev)',
  slug: 'acme-dev',
  plan: 'PRO',
};

// Dev users
const devUsers = [
  { email: 'owner@acme.dev', firstName: 'Alice', role: 'OWNER' },
  { email: 'admin@acme.dev', firstName: 'Bob',   role: 'ADMIN' },
  { email: 'member@acme.dev', firstName: 'Carol', role: 'MEMBER' },
];
```

---

## 7. Data Retention Policy

| Table | Retention | Action |
|-------|-----------|--------|
| `call_logs` | 2 years | Archive to cold storage |
| `messages` | 2 years | Archive to cold storage |
| `voicemails` | 90 days (recording) | Delete recording from S3; keep metadata |
| `usage_records` | 7 years | Required for billing/tax |
| `audit_logs` | 3 years | Compliance requirement |
| `refresh_tokens` (expired) | 30 days | Nightly cleanup job |
| `tokens` (used/expired) | 7 days | Nightly cleanup job |
| `webhook_deliveries` | 30 days | Rolling window |

---

## Appendix A: Document Change Log

| Date | Version | Changes | Author |
|------|---------|---------|--------|
| 2026-07-08 | 1.0.0-draft | Initial schema document | Principal Architect |
