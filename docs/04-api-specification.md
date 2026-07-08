# Phone2Client (P2C) — API Specification

> **Version**: v1  
> **Status**: In Review  
> **Last Updated**: 2026-07-08  
> **Author**: Principal Architect  
> **Base URL**: `https://api.p2c.io/api/v1`  
> **Companions**: [PRD](file:///d:/AI/Phone2Client%20-%20P2C/docs/01-PRD.md) | [DB Schema](file:///d:/AI/Phone2Client%20-%20P2C/docs/03-database-schema.md)

---

## 1. API Design Principles

### 1.1 Conventions

| Convention | Standard |
|-----------|---------|
| **Protocol** | HTTPS only; HTTP redirects to HTTPS |
| **Format** | JSON (`Content-Type: application/json`) |
| **Versioning** | URL path — `/api/v1/...`; breaking changes bump version |
| **Auth** | `Authorization: Bearer <access_token>` header |
| **Naming** | snake_case for JSON fields; kebab-case for URL paths |
| **IDs** | UUID v4 strings (never numeric IDs in URLs) |
| **Dates** | ISO 8601 UTC — `2026-07-08T01:00:00Z` |
| **Amounts** | Microdollars as integers in API; display layer converts |
| **Phone Numbers** | E.164 format — `+15551234567` |
| **Pagination** | Cursor-based for large collections; offset for small |
| **Errors** | RFC 7807 Problem Details |
| **Rate Limiting** | Standard `X-RateLimit-*` headers |

### 1.2 Global Headers

```http
# Request headers (required on all authenticated requests)
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
X-Workspace-Id: 550e8400-e29b-41d4-a716-446655440000
Content-Type: application/json

# Response headers (always present)
X-Request-Id: req_abc123def456        # Correlation ID for tracing
X-RateLimit-Limit: 1000               # Requests per window
X-RateLimit-Remaining: 987            # Remaining in current window
X-RateLimit-Reset: 1720400000         # Unix timestamp for window reset
X-RateLimit-Window: 60                # Window duration in seconds
```

### 1.3 Workspace Scoping

> [!IMPORTANT]
> All tenant-scoped endpoints require `X-Workspace-Id`. The authenticated user must be a member of that workspace. This is validated on **every request** by the tenant guard.

```http
# Workspace-scoped request example
GET /api/v1/contacts
Authorization: Bearer <token>
X-Workspace-Id: 550e8400-e29b-41d4-a716-446655440000
```

### 1.4 Pagination

#### Cursor-based (for large, real-time collections — calls, messages)
```http
GET /api/v1/messages?conversation_id=xxx&limit=50&cursor=msg_abc123
```
```json
{
  "data": [...],
  "pagination": {
    "cursor": "msg_xyz789",
    "has_more": true,
    "limit": 50
  }
}
```

#### Offset-based (for smaller, stable collections — contacts, phone numbers)
```http
GET /api/v1/contacts?page=2&limit=25
```
```json
{
  "data": [...],
  "pagination": {
    "page": 2,
    "limit": 25,
    "total": 342,
    "total_pages": 14
  }
}
```

### 1.5 Error Response (RFC 7807)
```json
{
  "type": "https://api.p2c.io/errors/validation-error",
  "title": "Validation Error",
  "status": 422,
  "detail": "The provided phone number is not in valid E.164 format.",
  "instance": "/api/v1/messages",
  "errors": [
    { "field": "to_number", "message": "Must be in E.164 format (+15551234567)" }
  ],
  "trace_id": "req_abc123def456",
  "timestamp": "2026-07-08T01:00:00Z"
}
```

---

## 2. Authentication

### 2.1 Rate Limits for Auth
| Endpoint | Limit | Window |
|----------|-------|--------|
| `POST /auth/register` | 5 requests | 1 hour per IP |
| `POST /auth/login` | 10 requests | 15 min per IP |
| `POST /auth/password-reset/request` | 3 requests | 1 hour per email |
| `POST /auth/token/refresh` | 60 requests | 1 hour per user |

---

### `POST /api/v1/auth/register`

Register a new user account. Sends a verification email.

**Request**
```json
{
  "email": "alice@acme.com",
  "password": "SecurePass123!",
  "first_name": "Alice",
  "last_name": "Chen"
}
```

**Response** `201 Created`
```json
{
  "user": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "email": "alice@acme.com",
    "first_name": "Alice",
    "last_name": "Chen",
    "status": "PENDING_VERIFICATION",
    "created_at": "2026-07-08T01:00:00Z"
  },
  "message": "Verification email sent to alice@acme.com"
}
```

**Errors**
| Status | Code | Condition |
|--------|------|-----------|
| 409 | `email-already-exists` | Email already registered |
| 422 | `validation-error` | Invalid email or weak password |

---

### `POST /api/v1/auth/login`

Authenticate and receive access + refresh tokens.

**Request**
```json
{
  "email": "alice@acme.com",
  "password": "SecurePass123!",
  "totp_code": "123456"  // Optional; required if MFA enabled
}
```

**Response** `200 OK`
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refresh_token": "rt_abc123xyz...",
  "token_type": "Bearer",
  "expires_in": 900,
  "user": {
    "id": "550e8400-...",
    "email": "alice@acme.com",
    "first_name": "Alice",
    "last_name": "Chen",
    "status": "ACTIVE",
    "workspaces": [
      {
        "id": "ws-uuid",
        "name": "Acme Corp",
        "slug": "acme-corp",
        "role": "OWNER",
        "plan": "PRO"
      }
    ]
  }
}
```

**Errors**
| Status | Code | Condition |
|--------|------|-----------|
| 401 | `invalid-credentials` | Wrong email/password |
| 403 | `email-not-verified` | Email not verified |
| 403 | `account-suspended` | Account suspended |
| 403 | `totp-required` | MFA enabled, no code provided |
| 401 | `invalid-totp` | Wrong MFA code |
| 429 | `rate-limited` | Too many login attempts |

---

### `POST /api/v1/auth/token/refresh`

Exchange a refresh token for a new access token + rotated refresh token.

**Request**
```json
{
  "refresh_token": "rt_abc123xyz..."
}
```

**Response** `200 OK`
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refresh_token": "rt_newtoken...",
  "token_type": "Bearer",
  "expires_in": 900
}
```

**Errors**
| Status | Code | Condition |
|--------|------|-----------|
| 401 | `invalid-refresh-token` | Token not found or expired |
| 401 | `token-reuse-detected` | Token family compromised — all sessions revoked |

---

### `POST /api/v1/auth/logout`
**Auth required**: Yes

Revoke the current refresh token (or all sessions with `all: true`).

**Request**
```json
{
  "refresh_token": "rt_abc123xyz...",
  "all": false
}
```

**Response** `204 No Content`

---

### `POST /api/v1/auth/email/verify`

Verify email with token from email link.

**Request**
```json
{ "token": "ver_abc123..." }
```

**Response** `200 OK`
```json
{ "message": "Email verified successfully." }
```

---

### `POST /api/v1/auth/password-reset/request`

Send a password reset email.

**Request**
```json
{ "email": "alice@acme.com" }
```

**Response** `200 OK` (always — prevents email enumeration)
```json
{ "message": "If an account exists, a reset email has been sent." }
```

---

### `POST /api/v1/auth/password-reset/confirm`

Reset password using token from email.

**Request**
```json
{
  "token": "rst_abc123...",
  "new_password": "NewSecurePass456!"
}
```

**Response** `200 OK`
```json
{ "message": "Password reset successfully. Please log in." }
```

---

## 3. Workspaces

### `POST /api/v1/workspaces`
**Auth required**: Yes (any authenticated user)

Create a new workspace. The authenticated user becomes the Owner.

**Request**
```json
{
  "name": "Acme Corp",
  "slug": "acme-corp",
  "timezone": "America/New_York"
}
```

**Response** `201 Created`
```json
{
  "id": "ws-uuid",
  "name": "Acme Corp",
  "slug": "acme-corp",
  "status": "ACTIVE",
  "plan": "FREE",
  "timezone": "America/New_York",
  "created_at": "2026-07-08T01:00:00Z",
  "member": {
    "id": "member-uuid",
    "role": "OWNER"
  }
}
```

---

### `GET /api/v1/workspaces/me`
**Auth required**: Yes | **Workspace scope**: Yes

Get the current workspace details.

**Response** `200 OK`
```json
{
  "id": "ws-uuid",
  "name": "Acme Corp",
  "slug": "acme-corp",
  "status": "ACTIVE",
  "plan": "PRO",
  "timezone": "America/New_York",
  "logo_url": null,
  "business_hours": {
    "monday": { "enabled": true, "open": "09:00", "close": "17:00" },
    "tuesday": { "enabled": true, "open": "09:00", "close": "17:00" },
    "saturday": { "enabled": false },
    "sunday": { "enabled": false }
  },
  "telnyx_profile_id": "telnyx-profile-uuid",
  "created_at": "2026-07-08T01:00:00Z",
  "updated_at": "2026-07-08T01:00:00Z"
}
```

---

### `PATCH /api/v1/workspaces/me`
**Auth required**: Yes | **Role**: Admin+

```json
{
  "name": "Acme Corporation",
  "timezone": "America/Los_Angeles",
  "business_hours": { ... }
}
```

**Response** `200 OK` — Updated workspace object

---

### `GET /api/v1/workspaces/me/members`
**Auth required**: Yes | **Workspace scope**: Yes

**Query params**: `?page=1&limit=25&role=MEMBER`

**Response** `200 OK`
```json
{
  "data": [
    {
      "id": "member-uuid",
      "user_id": "user-uuid",
      "email": "alice@acme.com",
      "first_name": "Alice",
      "last_name": "Chen",
      "display_name": null,
      "role": "OWNER",
      "avatar_url": null,
      "is_available": true,
      "joined_at": "2026-07-08T01:00:00Z"
    }
  ],
  "pagination": { "page": 1, "limit": 25, "total": 3, "total_pages": 1 }
}
```

---

### `POST /api/v1/workspaces/me/invitations`
**Auth required**: Yes | **Role**: Admin+

Invite a user to the workspace by email.

**Request**
```json
{
  "email": "bob@acme.com",
  "role": "MEMBER"
}
```

**Response** `201 Created`
```json
{
  "id": "invitation-uuid",
  "email": "bob@acme.com",
  "role": "MEMBER",
  "status": "PENDING",
  "expires_at": "2026-07-15T01:00:00Z",
  "created_at": "2026-07-08T01:00:00Z"
}
```

---

### `POST /api/v1/workspaces/invitations/accept`
**Auth required**: Yes (invitee must be authenticated or will be prompted to register)

**Request**
```json
{ "token": "inv_abc123..." }
```

**Response** `200 OK`
```json
{
  "workspace": { "id": "ws-uuid", "name": "Acme Corp" },
  "member": { "id": "member-uuid", "role": "MEMBER" }
}
```

---

### `PATCH /api/v1/workspaces/me/members/:memberId`
**Auth required**: Yes | **Role**: Admin+

Update member role or availability.

**Request**
```json
{
  "role": "ADMIN",
  "is_available": false
}
```

**Response** `200 OK` — Updated member object

---

### `DELETE /api/v1/workspaces/me/members/:memberId`
**Auth required**: Yes | **Role**: Owner (for admins) / Admin (for members)

Remove a member from the workspace.

**Response** `204 No Content`

---

## 4. Phone Numbers

### `GET /api/v1/phone-numbers/search`
**Auth required**: Yes | **Workspace scope**: Yes

Search available phone numbers via Telnyx.

**Query params**:
```
country_code=US
area_code=415
type=local           # local | toll_free
limit=20             # max 100
contains=555         # optional digit pattern
```

**Response** `200 OK`
```json
{
  "data": [
    {
      "number": "+14155551234",
      "type": "LOCAL",
      "country_code": "US",
      "area_code": "415",
      "region": "California",
      "city": "San Francisco",
      "capabilities": { "voice": true, "sms": true, "mms": true },
      "monthly_cost_microdollars": 1200000
    }
  ],
  "total": 87
}
```

---

### `POST /api/v1/phone-numbers`
**Auth required**: Yes | **Role**: Admin+ | **Workspace scope**: Yes

Purchase and provision a phone number.

**Request**
```json
{
  "number": "+14155551234",
  "friendly_name": "Sales Line",
  "ring_strategy": "SIMULTANEOUS",
  "ring_timeout": 30
}
```

**Response** `201 Created`
```json
{
  "id": "pn-uuid",
  "workspace_id": "ws-uuid",
  "number": "+14155551234",
  "friendly_name": "Sales Line",
  "type": "LOCAL",
  "status": "ACTIVE",
  "country_code": "US",
  "area_code": "415",
  "ring_strategy": "SIMULTANEOUS",
  "ring_timeout": 30,
  "capabilities": { "voice": true, "sms": true, "mms": true },
  "telnyx_number_id": "telnyx-uuid",
  "monthly_renews_at": "2026-08-08",
  "created_at": "2026-07-08T01:00:00Z"
}
```

---

### `GET /api/v1/phone-numbers`
**Auth required**: Yes | **Workspace scope**: Yes

**Response** `200 OK`
```json
{
  "data": [
    {
      "id": "pn-uuid",
      "number": "+14155551234",
      "friendly_name": "Sales Line",
      "type": "LOCAL",
      "status": "ACTIVE",
      "ring_strategy": "SIMULTANEOUS",
      "assignments": [
        {
          "member_id": "member-uuid",
          "display_name": "Alice Chen",
          "priority": 0
        }
      ]
    }
  ],
  "pagination": { "page": 1, "limit": 25, "total": 2 }
}
```

---

### `PATCH /api/v1/phone-numbers/:phoneNumberId`
**Auth required**: Yes | **Role**: Admin+ | **Workspace scope**: Yes

**Request**
```json
{
  "friendly_name": "Main Line",
  "ring_strategy": "SEQUENTIAL",
  "ring_timeout": 20,
  "voicemail_greeting_url": "https://storage.p2c.io/greetings/ws-uuid/vm.mp3"
}
```

**Response** `200 OK` — Updated phone number object

---

### `POST /api/v1/phone-numbers/:phoneNumberId/assignments`
**Auth required**: Yes | **Role**: Admin+ | **Workspace scope**: Yes

Assign a member to a phone number.

**Request**
```json
{
  "member_id": "member-uuid",
  "priority": 0
}
```

**Response** `201 Created`
```json
{
  "phone_number_id": "pn-uuid",
  "member_id": "member-uuid",
  "priority": 0,
  "assigned_at": "2026-07-08T01:00:00Z"
}
```

---

### `DELETE /api/v1/phone-numbers/:phoneNumberId/assignments/:memberId`
**Auth required**: Yes | **Role**: Admin+ | **Workspace scope**: Yes

**Response** `204 No Content`

---

### `DELETE /api/v1/phone-numbers/:phoneNumberId`
**Auth required**: Yes | **Role**: Owner only | **Workspace scope**: Yes

Release (delete) a phone number. Triggers Telnyx number release.

**Response** `200 OK`
```json
{
  "message": "Phone number +14155551234 released. Telnyx charges will cease at end of billing period."
}
```

---

## 5. Calls

### `POST /api/v1/calls/token`
**Auth required**: Yes | **Workspace scope**: Yes

Get a Telnyx WebRTC credential token for the browser SDK.

**Response** `200 OK`
```json
{
  "token": "telnyx-webrtc-credential-token...",
  "expires_in": 3600,
  "sip_username": "alice_ws-uuid",
  "connection_id": "telnyx-connection-uuid"
}
```

---

### `POST /api/v1/calls/outbound`
**Auth required**: Yes | **Workspace scope**: Yes

Initiate an outbound call.

**Request**
```json
{
  "from_number_id": "pn-uuid",
  "to_number": "+15559876543"
}
```

**Response** `201 Created`
```json
{
  "id": "call-uuid",
  "direction": "OUTBOUND",
  "status": "INITIATED",
  "from_number": "+14155551234",
  "to_number": "+15559876543",
  "telnyx_call_id": "telnyx-call-uuid",
  "started_at": "2026-07-08T01:00:00Z"
}
```

---

### `GET /api/v1/calls`
**Auth required**: Yes | **Workspace scope**: Yes

List call history.

**Query params**:
```
page=1
limit=25
direction=INBOUND       # INBOUND | OUTBOUND
status=COMPLETED        # COMPLETED | MISSED | VOICEMAIL | ...
phone_number_id=pn-uuid
contact_id=contact-uuid
from=2026-07-01
to=2026-07-08
search=+14155551234     # Search by phone number
```

**Response** `200 OK`
```json
{
  "data": [
    {
      "id": "call-uuid",
      "direction": "INBOUND",
      "status": "COMPLETED",
      "from_number": "+15559876543",
      "to_number": "+14155551234",
      "phone_number": {
        "id": "pn-uuid",
        "friendly_name": "Sales Line"
      },
      "contact": {
        "id": "contact-uuid",
        "display_name": "Bob Smith",
        "avatar_url": null
      },
      "answered_by": {
        "id": "member-uuid",
        "display_name": "Alice Chen"
      },
      "started_at": "2026-07-08T01:00:00Z",
      "answered_at": "2026-07-08T01:00:12Z",
      "ended_at": "2026-07-08T01:05:23Z",
      "duration_seconds": 311,
      "cost_microdollars": 35765,
      "has_voicemail": false,
      "has_recording": false
    }
  ],
  "pagination": { "page": 1, "limit": 25, "total": 142 }
}
```

---

### `GET /api/v1/calls/:callId`
**Auth required**: Yes | **Workspace scope**: Yes

Get a single call record with full details.

**Response** `200 OK` — Full call object as above

---

## 6. Conversations & Messages

### `GET /api/v1/conversations`
**Auth required**: Yes | **Workspace scope**: Yes

Get the message inbox.

**Query params**:
```
page=1
limit=25
phone_number_id=pn-uuid
is_archived=false
search=Bob               # Search contact name or phone number
```

**Response** `200 OK`
```json
{
  "data": [
    {
      "id": "conv-uuid",
      "phone_number": {
        "id": "pn-uuid",
        "number": "+14155551234",
        "friendly_name": "Sales Line"
      },
      "contact": {
        "id": "contact-uuid",
        "display_name": "Bob Smith",
        "avatar_url": null
      },
      "external_number": "+15559876543",
      "last_message_at": "2026-07-08T00:58:00Z",
      "last_message_body": "Sounds good, I'll call you tomorrow.",
      "unread_count": 2,
      "is_archived": false,
      "is_spam": false
    }
  ],
  "pagination": { "page": 1, "limit": 25, "total": 47 }
}
```

---

### `GET /api/v1/conversations/:conversationId/messages`
**Auth required**: Yes | **Workspace scope**: Yes

Get messages in a conversation (cursor paginated — newest first by default).

**Query params**:
```
limit=50
cursor=msg-uuid          # Exclusive cursor (message ID)
direction=desc           # desc | asc
```

**Response** `200 OK`
```json
{
  "data": [
    {
      "id": "msg-uuid",
      "conversation_id": "conv-uuid",
      "direction": "INBOUND",
      "type": "SMS",
      "status": "DELIVERED",
      "from_number": "+15559876543",
      "to_number": "+14155551234",
      "body": "Hey, can we chat tomorrow?",
      "sent_by": null,
      "media": [],
      "segment_count": 1,
      "cost_microdollars": 0,
      "sent_at": "2026-07-08T00:55:00Z",
      "delivered_at": "2026-07-08T00:55:02Z",
      "created_at": "2026-07-08T00:55:00Z"
    }
  ],
  "pagination": {
    "cursor": "msg-older-uuid",
    "has_more": true,
    "limit": 50
  }
}
```

---

### `POST /api/v1/conversations/:conversationId/messages`
**Auth required**: Yes | **Workspace scope**: Yes

Send a message in an existing conversation.

**Request** (`multipart/form-data` for MMS with media)
```json
{
  "body": "Sure, let's talk at 10am!",
  "type": "SMS"
}
```

**For MMS** (multipart/form-data):
```
body: "Check out this photo!"
type: MMS
media[0]: <file upload>
```

**Response** `201 Created`
```json
{
  "id": "msg-uuid",
  "conversation_id": "conv-uuid",
  "direction": "OUTBOUND",
  "type": "SMS",
  "status": "QUEUED",
  "from_number": "+14155551234",
  "to_number": "+15559876543",
  "body": "Sure, let's talk at 10am!",
  "sent_by": {
    "id": "member-uuid",
    "display_name": "Alice Chen"
  },
  "media": [],
  "created_at": "2026-07-08T01:00:00Z"
}
```

---

### `POST /api/v1/messages`
**Auth required**: Yes | **Workspace scope**: Yes

Send a new message (creates conversation if it doesn't exist).

**Request**
```json
{
  "from_number_id": "pn-uuid",
  "to_number": "+15559876543",
  "body": "Hello! This is Acme Corp.",
  "type": "SMS"
}
```

**Response** `201 Created` — Same as above, includes `conversation_id`

---

### `PATCH /api/v1/conversations/:conversationId`
**Auth required**: Yes | **Workspace scope**: Yes

Mark conversation as read, archived, or spam.

**Request**
```json
{
  "is_archived": true,
  "is_spam": false,
  "mark_read": true
}
```

**Response** `200 OK` — Updated conversation object

---

## 7. Contacts

### `GET /api/v1/contacts`
**Auth required**: Yes | **Workspace scope**: Yes

**Query params**:
```
page=1
limit=25
search=Bob              # FTS on name, company, phone
tags=customer,vip       # Comma-separated tag filter
is_blocked=false
sort=last_name          # last_name | company | created_at
order=asc
```

**Response** `200 OK`
```json
{
  "data": [
    {
      "id": "contact-uuid",
      "first_name": "Bob",
      "last_name": "Smith",
      "company": "Smith LLC",
      "email": "bob@smithllc.com",
      "phone_numbers": [
        { "number": "+15559876543", "label": "mobile", "is_primary": true }
      ],
      "tags": ["customer", "vip"],
      "avatar_url": null,
      "notes": "Met at SaaStr 2025",
      "is_blocked": false,
      "created_at": "2026-07-01T10:00:00Z"
    }
  ],
  "pagination": { "page": 1, "limit": 25, "total": 342 }
}
```

---

### `POST /api/v1/contacts`
**Auth required**: Yes | **Workspace scope**: Yes

**Request**
```json
{
  "first_name": "Bob",
  "last_name": "Smith",
  "company": "Smith LLC",
  "email": "bob@smithllc.com",
  "phone_numbers": [
    { "number": "+15559876543", "label": "mobile", "is_primary": true }
  ],
  "tags": ["customer"],
  "notes": "Met at SaaStr 2025"
}
```

**Response** `201 Created` — Full contact object

---

### `GET /api/v1/contacts/:contactId`
**Auth required**: Yes | **Workspace scope**: Yes

**Response** `200 OK` — Full contact object with recent call + message activity

---

### `PATCH /api/v1/contacts/:contactId`
**Auth required**: Yes | **Workspace scope**: Yes

Partial update — any field from POST body.

**Response** `200 OK` — Updated contact object

---

### `DELETE /api/v1/contacts/:contactId`
**Auth required**: Yes | **Workspace scope**: Yes

Soft-delete. Preserves call/message history.

**Response** `204 No Content`

---

### `POST /api/v1/contacts/import`
**Auth required**: Yes | **Role**: Admin+ | **Workspace scope**: Yes

Import contacts from CSV.

**Request**: `multipart/form-data` with `file` field (CSV).

**Response** `202 Accepted` — Returns a job ID
```json
{
  "job_id": "job-uuid",
  "status": "QUEUED",
  "total_rows": 500,
  "status_url": "/api/v1/contacts/import/job-uuid"
}
```

---

### `GET /api/v1/contacts/import/:jobId`
**Auth required**: Yes | **Workspace scope**: Yes

**Response** `200 OK`
```json
{
  "job_id": "job-uuid",
  "status": "COMPLETED",
  "total_rows": 500,
  "imported": 495,
  "skipped": 3,
  "failed": 2,
  "errors": [
    { "row": 47, "reason": "Invalid phone number format" }
  ]
}
```

---

## 8. Voicemail

### `GET /api/v1/voicemails`
**Auth required**: Yes | **Workspace scope**: Yes

**Query params**: `?is_read=false&phone_number_id=pn-uuid&limit=25&cursor=vm-uuid`

**Response** `200 OK`
```json
{
  "data": [
    {
      "id": "vm-uuid",
      "phone_number": { "id": "pn-uuid", "number": "+14155551234" },
      "from_number": "+15559876543",
      "contact": {
        "id": "contact-uuid",
        "display_name": "Bob Smith"
      },
      "status": "TRANSCRIBED",
      "duration_seconds": 42,
      "transcription": "Hey Alice, it's Bob. Calling about the contract. Give me a call back.",
      "recording_url": "https://storage.p2c.io/voicemails/signed-url...",
      "is_read": false,
      "created_at": "2026-07-08T00:30:00Z"
    }
  ],
  "pagination": { "cursor": "vm-older-uuid", "has_more": false, "limit": 25 }
}
```

---

### `PATCH /api/v1/voicemails/:voicemailId`
**Auth required**: Yes | **Workspace scope**: Yes

Mark as read or unread.

**Request**
```json
{ "is_read": true }
```

**Response** `200 OK` — Updated voicemail

---

### `DELETE /api/v1/voicemails/:voicemailId`
**Auth required**: Yes | **Workspace scope**: Yes

Soft-delete voicemail and delete recording from storage.

**Response** `204 No Content`

---

## 9. Billing

### `GET /api/v1/billing`
**Auth required**: Yes | **Role**: Admin+ | **Workspace scope**: Yes

Get billing account status.

**Response** `200 OK`
```json
{
  "plan": "PRO",
  "balance_microdollars": 5420000,
  "balance_display": "$5.42",
  "auto_reload": {
    "enabled": true,
    "threshold_microdollars": 2000000,
    "amount_microdollars": 10000000
  },
  "monthly_limit_microdollars": null,
  "current_period": {
    "start": "2026-07-01",
    "end": "2026-07-31"
  },
  "stripe_customer_id": "cus_xxx",
  "has_payment_method": true
}
```

---

### `POST /api/v1/billing/credits/add`
**Auth required**: Yes | **Role**: Admin+ | **Workspace scope**: Yes

Add credits to the workspace balance (triggers Stripe payment).

**Request**
```json
{
  "amount_microdollars": 10000000,
  "payment_method_id": "pm_xxx"
}
```

**Response** `200 OK`
```json
{
  "transaction_id": "txn-uuid",
  "amount_added_microdollars": 10000000,
  "new_balance_microdollars": 15420000,
  "stripe_payment_intent_id": "pi_xxx"
}
```

---

### `PATCH /api/v1/billing/auto-reload`
**Auth required**: Yes | **Role**: Admin+ | **Workspace scope**: Yes

**Request**
```json
{
  "enabled": true,
  "threshold_microdollars": 2000000,
  "amount_microdollars": 10000000
}
```

**Response** `200 OK` — Updated billing account

---

### `GET /api/v1/billing/usage`
**Auth required**: Yes | **Role**: Admin+ | **Workspace scope**: Yes

**Query params**: `?from=2026-07-01&to=2026-07-08&group_by=day`

**Response** `200 OK`
```json
{
  "summary": {
    "total_cost_microdollars": 1234567,
    "calls_inbound_minutes": 342,
    "calls_outbound_minutes": 187,
    "sms_outbound": 523,
    "sms_inbound": 618,
    "mms_outbound": 12,
    "phone_number_monthly_count": 2
  },
  "by_day": [
    {
      "date": "2026-07-08",
      "cost_microdollars": 234567,
      "calls_minutes": 45,
      "sms_count": 78
    }
  ]
}
```

---

### `GET /api/v1/billing/transactions`
**Auth required**: Yes | **Role**: Admin+ | **Workspace scope**: Yes

**Response** `200 OK`
```json
{
  "data": [
    {
      "id": "txn-uuid",
      "type": "usage_deduction",
      "amount_microdollars": -48500,
      "balance_after_microdollars": 5371500,
      "description": "Outbound call to +15559876543 (5 min 12 sec)",
      "created_at": "2026-07-08T01:05:30Z"
    }
  ],
  "pagination": { "page": 1, "limit": 25, "total": 87 }
}
```

---

### `GET /api/v1/billing/invoices`
**Auth required**: Yes | **Role**: Admin+ | **Workspace scope**: Yes

**Response** `200 OK`
```json
{
  "data": [
    {
      "id": "inv-uuid",
      "invoice_number": "P2C-2026-07-001",
      "period_start": "2026-07-01",
      "period_end": "2026-07-31",
      "amount_microdollars": 12340000,
      "pdf_url": "https://storage.p2c.io/invoices/signed-url...",
      "paid_at": null,
      "created_at": "2026-07-31T23:59:00Z"
    }
  ],
  "pagination": { "page": 1, "limit": 25, "total": 3 }
}
```

---

## 10. Webhooks (Outbound — Customer Webhooks)

### `GET /api/v1/webhooks`
**Auth required**: Yes | **Role**: Admin+ | **Workspace scope**: Yes

**Response** `200 OK`
```json
{
  "data": [
    {
      "id": "wh-uuid",
      "url": "https://your-app.com/webhooks/p2c",
      "events": ["call.completed", "message.received"],
      "is_active": true,
      "created_at": "2026-07-08T01:00:00Z"
    }
  ]
}
```

---

### `POST /api/v1/webhooks`
**Auth required**: Yes | **Role**: Admin+ | **Workspace scope**: Yes

**Request**
```json
{
  "url": "https://your-app.com/webhooks/p2c",
  "events": ["call.completed", "message.received", "voicemail.created"]
}
```

**Available events**:
- `call.initiated`, `call.answered`, `call.completed`, `call.missed`, `call.voicemail`
- `message.received`, `message.sent`, `message.delivered`, `message.failed`
- `voicemail.created`, `voicemail.transcribed`
- `contact.created`, `contact.updated`
- `workspace.member.added`, `workspace.member.removed`
- `billing.low_balance`, `billing.credit_added`

**Response** `201 Created`
```json
{
  "id": "wh-uuid",
  "url": "https://your-app.com/webhooks/p2c",
  "secret": "whsec_abc123xyz...",  // Only returned once — store securely!
  "events": ["call.completed", "message.received"],
  "is_active": true,
  "created_at": "2026-07-08T01:00:00Z"
}
```

---

## 11. Telnyx Webhook Receiver (Inbound)

### `POST /api/v1/webhooks/telnyx`

> **Public endpoint** — No auth header required. Validated via Telnyx Ed25519 signature.

```http
POST /api/v1/webhooks/telnyx
telnyx-signature-ed25519: <signature>
telnyx-timestamp: <unix-timestamp>
Content-Type: application/json
```

**Response**: Always `200 OK` (synchronously). Processing is async via BullMQ.

**Supported Telnyx event types handled**:

| Event | Handler |
|-------|---------|
| `call.initiated` | Create CDR, route to members via WebSocket |
| `call.answered` | Update CDR, notify other members |
| `call.hangup` | Finalize CDR, calculate cost, trigger billing |
| `call.machine.detection.ended` | Route to voicemail if MACHINE |
| `call.recording.saved` | Store recording URL on CDR |
| `message.received` | Store message, push WebSocket event |
| `message.sent` | Update message status |
| `message.finalized` | Final delivery status |

---

## 12. API Keys

### `GET /api/v1/api-keys`
**Auth required**: Yes | **Workspace scope**: Yes

**Response** `200 OK`
```json
{
  "data": [
    {
      "id": "key-uuid",
      "name": "HubSpot Integration",
      "key_prefix": "p2c_sk_abc1",
      "status": "ACTIVE",
      "scopes": ["calls:read", "messages:write"],
      "last_used_at": "2026-07-08T00:45:00Z",
      "expires_at": null,
      "created_at": "2026-07-01T10:00:00Z"
    }
  ]
}
```

---

### `POST /api/v1/api-keys`
**Auth required**: Yes | **Role**: Admin+ | **Workspace scope**: Yes

**Request**
```json
{
  "name": "HubSpot Integration",
  "scopes": ["calls:read", "messages:write"],
  "expires_at": null
}
```

**Available scopes**:
- `calls:read`, `calls:write`
- `messages:read`, `messages:write`
- `contacts:read`, `contacts:write`
- `phone-numbers:read`, `phone-numbers:write`
- `voicemails:read`
- `billing:read`
- `workspace:read`

**Response** `201 Created`
```json
{
  "id": "key-uuid",
  "name": "HubSpot Integration",
  "key": "p2c_sk_abc123xyz...",  // Only returned ONCE — store securely!
  "key_prefix": "p2c_sk_abc1",
  "scopes": ["calls:read", "messages:write"],
  "created_at": "2026-07-08T01:00:00Z"
}
```

---

### `DELETE /api/v1/api-keys/:keyId`
**Auth required**: Yes | **Role**: Admin+ | **Workspace scope**: Yes

Revoke an API key immediately.

**Response** `204 No Content`

---

## 13. Settings & Profile

### `GET /api/v1/users/me`
**Auth required**: Yes

**Response** `200 OK`
```json
{
  "id": "user-uuid",
  "email": "alice@acme.com",
  "first_name": "Alice",
  "last_name": "Chen",
  "avatar_url": null,
  "phone_number": null,
  "status": "ACTIVE",
  "totp_enabled": false,
  "last_login_at": "2026-07-08T01:00:00Z",
  "created_at": "2026-07-01T10:00:00Z"
}
```

---

### `PATCH /api/v1/users/me`
**Auth required**: Yes

**Request**
```json
{
  "first_name": "Alice",
  "last_name": "Chen-Wu",
  "phone_number": "+14155559999"
}
```

**Response** `200 OK` — Updated user object

---

### `POST /api/v1/users/me/avatar`
**Auth required**: Yes

Upload a new avatar. `multipart/form-data` with `file` field (JPEG/PNG, max 2MB).

**Response** `200 OK`
```json
{ "avatar_url": "https://storage.p2c.io/avatars/user-uuid.jpg" }
```

---

### `POST /api/v1/users/me/password`
**Auth required**: Yes

Change password (requires current password).

**Request**
```json
{
  "current_password": "OldPass123!",
  "new_password": "NewSecurePass456!"
}
```

**Response** `200 OK`
```json
{ "message": "Password changed. All other sessions have been revoked." }
```

---

### `GET /api/v1/notifications/preferences`
**Auth required**: Yes | **Workspace scope**: Yes

**Response** `200 OK`
```json
{
  "incoming_call": true,
  "missed_call": true,
  "new_voicemail": true,
  "new_message": true,
  "email_missed_call": true,
  "email_new_voicemail": true,
  "email_new_message": false,
  "push_enabled": false
}
```

---

### `PATCH /api/v1/notifications/preferences`
**Auth required**: Yes | **Workspace scope**: Yes

**Request** — Any subset of the GET response fields

**Response** `200 OK` — Updated preferences

---

## 14. Rate Limits Summary

| Endpoint Group | Limit | Window |
|----------------|-------|--------|
| Auth endpoints | 10 req | 15 min (per IP) |
| `POST /messages` | 60 req | 1 min (per workspace) |
| `POST /calls/outbound` | 30 req | 1 min (per workspace) |
| `GET /phone-numbers/search` | 20 req | 1 min (per workspace) |
| All other API endpoints | 1000 req | 1 min (per workspace) |
| API key endpoints | 500 req | 1 min (per key) |
| Telnyx webhook receiver | Unlimited | (internal, bypasses limits) |

---

## 15. WebSocket Events Reference

> **Connection**: `wss://api.p2c.io/ws?token=<access_token>&workspace_id=<ws-uuid>`

### Server → Client Events

| Event | Payload | Description |
|-------|---------|-------------|
| `call:incoming` | `{ call_id, from_number, to_number, phone_number_id, contact?, telnyx_call_id }` | Incoming call — ring notification |
| `call:state` | `{ call_id, status, answered_by? }` | Call status changed |
| `call:ended` | `{ call_id, duration_seconds, status }` | Call ended |
| `message:new` | Full message object | New inbound or outbound message |
| `message:status` | `{ message_id, status, delivered_at? }` | Delivery status update |
| `voicemail:new` | Full voicemail object (no recording URL) | New voicemail received |
| `voicemail:transcribed` | `{ voicemail_id, transcription }` | Transcription available |
| `notification:info` | `{ title, body, resource_type, resource_id }` | General notification |
| `billing:low_balance` | `{ balance_microdollars, threshold_microdollars }` | Low balance alert |
| `presence:update` | `{ member_id, status: 'online'|'offline'|'busy' }` | Member presence change |

### Client → Server Events

| Event | Payload | Description |
|-------|---------|-------------|
| `presence:set` | `{ status: 'online'|'busy'|'offline' }` | Update own presence |
| `conversation:read` | `{ conversation_id }` | Mark conversation as read |
| `auth:refresh` | `{ refresh_token }` | Refresh WebSocket auth token |

---

## Appendix A: OpenAPI Specification File

> Full OpenAPI 3.1 YAML will be auto-generated from NestJS decorators.  
> Location: `apps/api/src/openapi.yaml` (generated at build time)  
> Swagger UI: `https://api.p2c.io/api/docs` (dev + staging only)

---

## Appendix B: Document Change Log

| Date | Version | Changes | Author |
|------|---------|---------|--------|
| 2026-07-08 | 1.0.0-draft | Initial API specification | Principal Architect |
