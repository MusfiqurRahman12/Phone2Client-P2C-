# Phone2Client (P2C) — Telephony Provider Abstraction

> **Version**: 1.0.0-draft  
> **Status**: Awaiting Stakeholder Approval  
> **Last Updated**: 2026-07-09  
> **Author**: Principal Architect  
> **Companions**: [Architecture](file:///d:/AI/Phone2Client%20-%20P2C/docs/02-system-architecture.md) | [Database Schema](file:///d:/AI/Phone2Client%20-%20P2C/docs/03-database-schema.md)

---

## 1. Purpose

P2C supports multiple telephony backend providers — starting with **Telnyx** and **Twilio** — through a clean provider abstraction layer. This document describes:

- The `ITelephonyProvider` interface contract
- The `TelephonyProviderFactory` runtime resolver
- Provider-specific adapter implementations (Telnyx, Twilio)
- Webhook normalization pipeline
- Frontend WebRTC SDK loading strategy
- Per-workspace provider configuration

> **Design Goal**: All business logic (use cases, services) depends only on `ITelephonyProvider`. Adding a new provider requires implementing one adapter class — zero changes to business logic.

---

## 2. `ITelephonyProvider` Interface

Located at: `apps/api/src/common/interfaces/telephony-provider.interface.ts`

```typescript
export type TelephonyProviderType = 'telnyx' | 'twilio';

// ─── Shared parameter/return types ───────────────────────────────────────────

export interface SearchNumbersParams {
  country: string;       // ISO 3166-1 alpha-2 (e.g. 'US')
  areaCode?: string;
  contains?: string;     // number pattern search
  limit?: number;
  numberType?: 'local' | 'toll_free' | 'mobile';
}

export interface AvailableNumber {
  number: string;        // E.164
  friendlyName: string;
  type: 'local' | 'toll_free' | 'mobile';
  monthlyRate: number;   // USD cents (provider's raw cost — P2C adds margin)
  capabilities: { voice: boolean; sms: boolean; mms: boolean };
}

export interface PurchaseNumberParams {
  number: string;        // E.164
  workspaceId: string;
  webhookBaseUrl: string;
}

export interface PurchasedNumber {
  providerNumberId: string;
  providerOrderId?: string;
  number: string;
  monthlyRate: number;   // USD cents
}

export interface InitiateCallParams {
  from: string;          // E.164
  to: string;            // E.164
  workspaceId: string;
  webhookBaseUrl: string;
  answeredByHuman?: boolean;
}

export interface CallResult {
  providerCallId: string;
}

export interface WebRtcToken {
  token: string;         // Provider-issued credential
  expiresAt: Date;
}

export interface SendSmsParams {
  from: string;          // E.164
  to: string;            // E.164
  body: string;
  workspaceId: string;
  messagingProfileId?: string;
}

export interface SendMmsParams extends SendSmsParams {
  mediaUrls: string[];
}

export interface MessageResult {
  providerMessageId: string;
}

// ─── Normalized webhook event (provider-agnostic) ─────────────────────────────

export type NormalizedEventType =
  | 'call.initiated'
  | 'call.answered'
  | 'call.hangup'
  | 'call.machine_detected'
  | 'message.received'
  | 'message.sent'
  | 'message.delivered'
  | 'message.failed';

export interface NormalizedWebhookEvent {
  eventType: NormalizedEventType;
  provider: TelephonyProviderType;
  providerEventId: string;          // Unique per provider; used for dedup
  providerCallId?: string;
  providerMessageId?: string;
  fromNumber?: string;              // E.164
  toNumber?: string;                // E.164
  callDurationSeconds?: number;
  callStatus?: string;
  messageBody?: string;
  mediaUrls?: string[];
  rawPayload: unknown;              // Original provider payload (for debugging)
  occurredAt: Date;
}

// ─── The interface ─────────────────────────────────────────────────────────────

export interface ITelephonyProvider {
  readonly type: TelephonyProviderType;

  // Phone Numbers
  searchAvailableNumbers(params: SearchNumbersParams): Promise<AvailableNumber[]>;
  purchaseNumber(params: PurchaseNumberParams): Promise<PurchasedNumber>;
  releaseNumber(providerNumberId: string): Promise<void>;

  // Voice
  initiateCall(params: InitiateCallParams): Promise<CallResult>;
  hangupCall(providerCallId: string): Promise<void>;
  generateWebRtcToken(workspaceId: string, userId: string): Promise<WebRtcToken>;

  // Messaging
  sendSms(params: SendSmsParams): Promise<MessageResult>;
  sendMms(params: SendMmsParams): Promise<MessageResult>;

  // Webhooks
  verifyWebhookSignature(rawBody: string, signature: string, secret: string): boolean;
  parseWebhookEvent(rawPayload: unknown): NormalizedWebhookEvent;
}
```

---

## 3. Provider Factory

Located at: `apps/api/src/modules/telephony/providers/telephony-provider.factory.ts`

```typescript
import { Injectable } from '@nestjs/common';
import { ITelephonyProvider } from '../../../common/interfaces/telephony-provider.interface';
import { TelnyxAdapter } from '../../../infrastructure/telephony/telnyx/telnyx.service';
import { TwilioAdapter } from '../../../infrastructure/telephony/twilio/twilio.service';
import { Workspace } from '@prisma/client';

@Injectable()
export class TelephonyProviderFactory {
  constructor(
    private readonly telnyx: TelnyxAdapter,
    private readonly twilio: TwilioAdapter,
  ) {}

  forWorkspace(workspace: Pick<Workspace, 'telephonyProvider'>): ITelephonyProvider {
    switch (workspace.telephonyProvider) {
      case 'TELNYX': return this.telnyx;
      case 'TWILIO': return this.twilio;
      default:
        throw new Error(`Unsupported telephony provider: ${workspace.telephonyProvider}`);
    }
  }
}
```

**Usage in a service:**

```typescript
// call.service.ts
async initiateOutboundCall(workspaceId: string, from: string, to: string) {
  const workspace = await this.workspaceRepo.findById(workspaceId);
  const provider = this.providerFactory.forWorkspace(workspace);   // ← resolves at runtime
  const result = await provider.initiateCall({ from, to, workspaceId, webhookBaseUrl: this.config.webhookBaseUrl });
  // ... CDR creation, billing, etc.
}
```

---

## 4. Adapter Implementations

### 4.1 Telnyx Adapter

Located at: `apps/api/src/infrastructure/telephony/telnyx/telnyx.service.ts`

| Method | Telnyx API | Notes |
|--------|-----------|-------|
| `searchAvailableNumbers` | `GET /available_phone_numbers` | Maps `phone_number` response to `AvailableNumber` |
| `purchaseNumber` | `POST /phone_number_orders` | Configures TeXML webhook on purchase |
| `releaseNumber` | `DELETE /phone_numbers/{id}` | |
| `initiateCall` | `POST /calls` | Uses Call Control v2 |
| `hangupCall` | `POST /calls/{id}/actions/hangup` | |
| `generateWebRtcToken` | `POST /telephony_credentials` or credential login | Returns SIP credential |
| `sendSms` | `POST /messages` | Requires `messaging_profile_id` |
| `sendMms` | `POST /messages` with media | |
| `verifyWebhookSignature` | Ed25519 verification (`telnyx-signature-ed25519`) | |
| `parseWebhookEvent` | Maps Telnyx event payload → `NormalizedWebhookEvent` | |

**Telnyx-specific resources provisioned on workspace onboarding:**
1. Create Messaging Profile → store `telnyxMessagingProfileId`
2. Create TeXML App (webhook URL) → store `telnyxAppId`
3. Create Voice Connection → store `telnyxConnectionId`
4. Create SIP Credential → store `telnyxSipCredentialId`

### 4.2 Twilio Adapter

Located at: `apps/api/src/infrastructure/telephony/twilio/twilio.service.ts`

| Method | Twilio API | Notes |
|--------|-----------|-------|
| `searchAvailableNumbers` | `GET /Accounts/{SID}/AvailablePhoneNumbers/{country}/{type}` | |
| `purchaseNumber` | `POST /Accounts/{SID}/IncomingPhoneNumbers` | Sets webhook on purchase |
| `releaseNumber` | `DELETE /Accounts/{SID}/IncomingPhoneNumbers/{SID}` | |
| `initiateCall` | `POST /Accounts/{SID}/Calls` | TwiML or TwiML App |
| `hangupCall` | `POST /Accounts/{SID}/Calls/{SID}` with `Status: completed` | |
| `generateWebRtcToken` | Twilio `AccessToken` + `VoiceGrant` | Returns JWT for Twilio Voice JS SDK |
| `sendSms` | `POST /Accounts/{SID}/Messages` | Uses `MessagingServiceSid` |
| `sendMms` | `POST /Accounts/{SID}/Messages` with `MediaUrl[]` | |
| `verifyWebhookSignature` | HMAC-SHA1 via `X-Twilio-Signature` | Uses `twilio.validateRequest()` |
| `parseWebhookEvent` | Maps Twilio event form fields → `NormalizedWebhookEvent` | |

**Twilio-specific resources provisioned on workspace onboarding:**
1. Create Messaging Service → store `twilioMessagingServiceSid`
2. Create TwiML App (voice + SMS webhooks) → store `twilioTwimlAppSid`
3. Optionally create Subaccount for billing isolation → store `twilioSubaccountSid`

---

## 5. Webhook Normalization Pipeline

Both providers POST to separate webhook endpoints. Both are validated, normalized, and fed into the **same** `WebhookProcessingService`.

```
┌─────────────────────────────────────────────────────────────────┐
│  Inbound Webhooks                                               │
│                                                                 │
│  POST /api/v1/webhooks/telnyx  ──► TelnyxAdapter               │
│  POST /api/v1/webhooks/twilio  ──► TwilioAdapter               │
│                         │                                      │
│              Both produce NormalizedWebhookEvent               │
└─────────────────────────────────┬───────────────────────────────┘
                                  │
                                  ▼
                    ┌─────────────────────────┐
                    │  Signature Verified?     │
                    │  Yes → enqueue to BullMQ │
                    │  No  → 403 Forbidden     │
                    └────────────┬────────────┘
                                 │
                                 ▼ (async)
                    ┌─────────────────────────┐
                    │  provider-webhooks queue │
                    │  (BullMQ worker)         │
                    └────────────┬────────────┘
                                 │
                    ┌────────────▼────────────┐
                    │ WebhookProcessingService │
                    │  (provider-agnostic)     │
                    │                          │
                    │  call.initiated          │
                    │  call.answered           │
                    │  call.hangup             │
                    │  call.machine_detected   │
                    │  message.received        │
                    │  message.sent            │
                    │  message.delivered       │
                    │  message.failed          │
                    └──────────────────────────┘
```

### 5.1 Idempotency

```
Redis key: webhook:{provider}:{providerEventId}
TTL: 24 hours
Behaviour: If key exists → skip processing, return early
```

### 5.2 Twilio Voice — TwiML Response Note

Unlike Telnyx (which uses Call Control commands via REST), Twilio voice calls initiated via the PSTN require a **synchronous TwiML XML response** to the status callback. The `TwilioAdapter` handles this by returning the appropriate TwiML immediately for voice webhooks, while still enqueuing the normalized event for async business logic processing.

---

## 6. Frontend WebRTC SDK Strategy

The frontend loads provider SDKs **conditionally** based on the workspace's configured provider. This avoids loading both SDKs (adds ~150KB+ per SDK) for every user.

```typescript
// apps/web/src/hooks/useWebRTC.ts
import { useWorkspaceProvider } from './useWorkspace';

export function useWebRTC() {
  const provider = useWorkspaceProvider(); // 'telnyx' | 'twilio'

  const connect = useCallback(async (token: string) => {
    if (provider === 'telnyx') {
      const { TelnyxRTC } = await import('@telnyx/webrtc');  // lazy import
      // ... Telnyx-specific setup
    } else if (provider === 'twilio') {
      const { Device } = await import('@twilio/voice-sdk');  // lazy import
      // ... Twilio-specific setup
    }
  }, [provider]);

  return { connect };
}
```

**Backend token endpoint** (`GET /api/v1/telephony/webrtc-token`) returns a provider-appropriate token:
- **Telnyx**: SIP credential login token
- **Twilio**: `AccessToken` with `VoiceGrant`

The frontend does not need to know the token format — it just passes it to the correct SDK.

---

## 7. Provider Comparison

| Capability | Telnyx | Twilio | Notes |
|-----------|--------|--------|-------|
| **Outbound call price (US)** | ~$0.010/min | ~$0.014/min | Telnyx ~30% cheaper |
| **Inbound call price (US)** | ~$0.005/min | ~$0.0085/min | Telnyx ~40% cheaper |
| **SMS price (US outbound)** | ~$0.004/seg | ~$0.0079/seg | Telnyx ~50% cheaper |
| **Phone number (local US)** | ~$1.00/mo | ~$1.15/mo | Similar |
| **WebRTC/Browser calling** | ✓ (`@telnyx/webrtc`) | ✓ (`@twilio/voice-sdk`) | Both supported |
| **Webhook format** | JSON (Ed25519 signed) | Form-encoded (HMAC-SHA1) | Handled by adapters |
| **Call control style** | REST Call Control API | TwiML (sync response) | Both abstracted |
| **Ecosystem / integrations** | Growing | Very mature | Twilio has broader 3rd-party |
| **SIP trunking** | ✓ | ✓ | |
| **Number porting** | ✓ | ✓ | |

**Recommended default**: Telnyx (cost advantage). Offer Twilio for customers who have existing Twilio accounts/numbers.

---

## 8. Configuration

### 8.1 Environment Variables (Platform-Level)

```bash
# Telnyx (platform-level API key for provisioning resources)
TELNYX_API_KEY=KEY016...
TELNYX_WEBHOOK_SECRET=...

# Twilio (platform-level account for provisioning Twilio workspaces)
TWILIO_ACCOUNT_SID=ACxxx...
TWILIO_AUTH_TOKEN=...

# Shared
TELEPHONY_WEBHOOK_BASE_URL=https://api.p2c.io/api/v1/webhooks
```

### 8.2 Per-Workspace Configuration

Stored in `workspace_provider_configs` table (see [Database Schema](file:///d:/AI/Phone2Client%20-%20P2C/docs/03-database-schema.md#workspaceproviderconfig)). Sensitive fields (API keys, auth tokens) are **AES-256 encrypted at the application layer** before storage.

### 8.3 Adding a New Provider

To add a new telephony provider (e.g., Vonage, Bandwidth):

1. Add a new value to the `TelephonyProvider` Prisma enum
2. Add provider credential columns to `WorkspaceProviderConfig`
3. Create `apps/api/src/infrastructure/telephony/{provider}/{provider}.service.ts` implementing `ITelephonyProvider`
4. Register the adapter in `TelephonyProviderModule`
5. Add a `case` to `TelephonyProviderFactory.forWorkspace()`
6. Add provider SDK to `apps/web/src/hooks/useWebRTC.ts` lazy imports
7. **No changes** to business logic, services, or use cases

---

## Appendix A: Document Change Log

| Date | Version | Changes | Author |
|------|---------|---------|--------|
| 2026-07-09 | 1.0.0-draft | Initial document — provider abstraction design | Principal Architect |
