# Phone2Client (P2C) — Product Requirements Document

> **Version**: 1.0.0-draft  
> **Status**: Awaiting Stakeholder Approval  
> **Last Updated**: 2026-07-08  
> **Author**: Principal Architect

---

## 1. Executive Summary

**Phone2Client (P2C)** is a multi-tenant, cloud-native communications SaaS platform that enables businesses to manage calls, SMS/MMS, and voicemail through a unified web interface. Built on a **provider-agnostic telephony abstraction layer** with **Telnyx** and **Twilio** as first-class supported backends, P2C targets small-to-medium businesses (SMBs) and growing teams who need a professional phone system without enterprise-grade complexity or pricing.

### Value Proposition

| Dimension | P2C Advantage |
|-----------|---------------|
| **Cost** | Pay-as-you-go — no per-seat licensing; usage-based billing with provider cost passthrough |
| **Speed to Value** | Sign up → get a number → make calls in under 5 minutes |
| **Multi-Tenancy** | Full workspace isolation; one deployment serves all customers |
| **Provider Flexibility** | First-class support for Telnyx and Twilio; workspaces can use either provider |
| **Developer-First** | API-first architecture; every UI action has a corresponding API endpoint |
| **Extensibility** | Webhook-driven event system for CRM integrations and automations |

### Competitive Landscape

| Feature | OpenPhone | Dialpad | Google Voice | **P2C** |
|---------|-----------|---------|-------------|---------|
| Pay-as-you-go pricing | ✗ | ✗ | ✗ | ✓ |
| Multi-number support | ✓ | ✓ | ✗ | ✓ |
| Shared phone numbers | ✓ | ✓ | ✗ | ✓ |
| API access | ✓ (paid) | ✓ (paid) | ✗ | ✓ (included) |
| Self-hostable | ✗ | ✗ | ✗ | ✓ (roadmap) |
| CRM integrations | ✓ | ✓ | ✗ | ✓ (Phase 3+) |

---

## 2. Target Users & Personas

### 2.1 Primary Persona — "Sarah the Sales Manager"
- **Role**: Sales team lead at a 15-person SaaS company
- **Pain**: Paying $25/user/month for seats that make 10 calls/week
- **Need**: Shared team number, call routing, basic analytics
- **Behavior**: Lives in browser; uses Slack and HubSpot daily

### 2.2 Secondary Persona — "Mike the Solo Founder"
- **Role**: Solo consultant / freelancer
- **Pain**: Using personal phone for business; no separation
- **Need**: One dedicated business number, voicemail, SMS
- **Behavior**: Cost-sensitive; wants a free/cheap tier

### 2.3 Tertiary Persona — "DevOps Dave"
- **Role**: Technical co-founder building an app with embedded communications
- **Pain**: Twilio is powerful but requires months of development
- **Need**: API access, webhooks, programmatic call/SMS management
- **Behavior**: Evaluates via API docs first; cares about DX

---

## 3. Product Scope

### 3.1 In-Scope (MVP — Phase 1)

| Category | Features |
|----------|----------|
| **Authentication** | Email/password signup, email verification, password reset, JWT sessions |
| **Workspace Management** | Create workspace, invite members, assign roles (Owner/Admin/Member), select telephony provider |
| **Phone Numbers** | Search & purchase numbers (local/toll-free) via Telnyx **or** Twilio, assign to workspace |
| **Inbound Calls** | Receive calls via WebRTC in-browser, show caller ID, ring strategy (simultaneous/sequential) |
| **Outbound Calls** | Click-to-call from web app, outbound caller ID selection |
| **SMS/MMS** | Send and receive SMS/MMS, conversation threading, media attachments |
| **Voicemail** | Voicemail recording, playback, transcription |
| **Contacts** | Contact CRUD, auto-create from unknown callers, notes & tags |
| **Call History** | CDR (Call Detail Records) log, filtering, search |
| **Notifications** | In-app real-time notifications, browser push notifications |
| **Billing** | Usage tracking, provider cost passthrough + margin, Stripe integration |
| **Settings** | Workspace settings, user profile, notification preferences, business hours, provider selection |

### 3.2 Out-of-Scope (Future Phases)

| Phase | Features |
|-------|----------|
| **Phase 2** | IVR/auto-attendant, call recording, call transfer (warm/cold), hold music |
| **Phase 3** | CRM integrations (HubSpot, Salesforce), Zapier/webhook automations |
| **Phase 4** | Mobile apps (React Native), desktop app (Electron) |
| **Phase 5** | AI features — call summarization, sentiment analysis, smart routing |
| **Phase 6** | Additional provider support (Vonage, Bandwidth), number porting |

---

## 4. Functional Requirements

### FR-1: Authentication & Authorization

| ID | Requirement | Priority |
|----|------------|----------|
| FR-1.1 | Users register with email + password; email verification required | P0 |
| FR-1.2 | JWT-based session management with refresh token rotation | P0 |
| FR-1.3 | Password reset via email with time-limited tokens | P0 |
| FR-1.4 | Role-Based Access Control: Owner, Admin, Member | P0 |
| FR-1.5 | OAuth2 social login (Google, Microsoft) | P1 |
| FR-1.6 | Multi-factor authentication (TOTP) | P1 |
| FR-1.7 | API key management for programmatic access | P1 |

### FR-2: Workspace (Tenant) Management

| ID | Requirement | Priority |
|----|------------|----------|
| FR-2.1 | User creates a workspace during onboarding; becomes Owner | P0 |
| FR-2.2 | Owner/Admin can invite members via email | P0 |
| FR-2.3 | A user can belong to multiple workspaces | P0 |
| FR-2.4 | Each workspace has isolated data — no cross-tenant leakage | P0 |
| FR-2.5 | Workspace-level settings: name, timezone, business hours | P0 |
| FR-2.6 | Owner can transfer ownership to another Admin | P1 |
| FR-2.7 | Workspace suspension/deletion with data retention policy | P1 |

### FR-3: Phone Number Management

| ID | Requirement | Priority |
|----|------------|----------|
| FR-3.1 | Search available numbers by country, state/region, area code | P0 |
| FR-3.2 | Purchase number and associate with workspace via configured provider (Telnyx or Twilio) | P0 |
| FR-3.3 | Assign number to one or more workspace members | P0 |
| FR-3.4 | Configure per-number settings: greeting, voicemail, ring strategy | P0 |
| FR-3.5 | Release (delete) a number; delegate release to the underlying provider | P0 |
| FR-3.6 | Each workspace selects its telephony provider (Telnyx or Twilio) during setup | P0 |
| FR-3.7 | Port existing number into P2C via provider porting API | P2 |

### FR-4: Voice Calls

| ID | Requirement | Priority |
|----|------------|----------|
| FR-4.1 | WebRTC-based calling in the browser; Telnyx WebRTC SDK for Telnyx workspaces, Twilio JS SDK for Twilio workspaces | P0 |
| FR-4.2 | Inbound call routing to assigned members based on ring strategy | P0 |
| FR-4.3 | Outbound calling with workspace number as caller ID | P0 |
| FR-4.4 | Call state management: ringing, connected, on-hold, ended | P0 |
| FR-4.5 | DTMF tone sending during active calls | P0 |
| FR-4.6 | Call transfer (blind) | P1 |
| FR-4.7 | Call recording with consent management | P2 |
| FR-4.8 | Conference calling (3-way merge) | P2 |

### FR-5: Messaging (SMS/MMS)

| ID | Requirement | Priority |
|----|------------|----------|
| FR-5.1 | Send and receive SMS (up to 1600 chars with concatenation) | P0 |
| FR-5.2 | Send and receive MMS (images, up to 1MB per media) | P0 |
| FR-5.3 | Conversation threading by contact + phone number pair | P0 |
| FR-5.4 | Real-time message delivery via WebSocket | P0 |
| FR-5.5 | Message delivery status tracking (queued/sent/delivered/failed) | P0 |
| FR-5.6 | Shared inbox — multiple members see same conversation | P0 |
| FR-5.7 | Message templates / snippets | P1 |

### FR-6: Contacts

| ID | Requirement | Priority |
|----|------------|----------|
| FR-6.1 | CRUD contacts with name, phone, email, company, notes | P0 |
| FR-6.2 | Auto-create contact from unknown incoming call/SMS | P0 |
| FR-6.3 | Contact tagging and filtering | P0 |
| FR-6.4 | Contact import via CSV | P1 |
| FR-6.5 | Contact merge/deduplication | P2 |
| FR-6.6 | Contact sharing across workspace (default) with private option | P0 |

### FR-7: Voicemail

| ID | Requirement | Priority |
|----|------------|----------|
| FR-7.1 | Configurable voicemail greeting per number | P0 |
| FR-7.2 | Voicemail recording and storage | P0 |
| FR-7.3 | Voicemail playback in web UI | P0 |
| FR-7.4 | Voicemail transcription via provider transcription API or third-party STT | P1 |
| FR-7.5 | Voicemail-to-email forwarding | P1 |

### FR-8: Billing & Usage

| ID | Requirement | Priority |
|----|------------|----------|
| FR-8.1 | Track per-workspace usage: minutes, SMS count, number costs (normalized across providers) | P0 |
| FR-8.2 | Stripe integration for payment method management | P0 |
| FR-8.3 | Pre-paid balance / credit system with auto-reload | P0 |
| FR-8.4 | Usage dashboard with cost breakdown (provider cost visible to operators) | P0 |
| FR-8.5 | Invoice generation and history | P1 |
| FR-8.6 | Usage alerts and spending limits | P1 |

---

## 5. Non-Functional Requirements

### NFR-1: Performance

| ID | Requirement | Target |
|----|------------|--------|
| NFR-1.1 | API response time (p95) | < 200ms |
| NFR-1.2 | WebSocket message delivery latency | < 100ms |
| NFR-1.3 | WebRTC call setup time | < 3 seconds |
| NFR-1.4 | SMS delivery to Telnyx API | < 500ms |
| NFR-1.5 | Dashboard page load (LCP) | < 2 seconds |

### NFR-2: Scalability

| ID | Requirement | Target |
|----|------------|--------|
| NFR-2.1 | Support concurrent tenants | 10,000+ workspaces |
| NFR-2.2 | Support concurrent WebRTC sessions | 1,000+ simultaneous calls |
| NFR-2.3 | Message throughput | 500 msgs/sec across tenants |
| NFR-2.4 | Horizontal scaling via stateless services | Required |

### NFR-3: Reliability

| ID | Requirement | Target |
|----|------------|--------|
| NFR-3.1 | System uptime | 99.9% (8.76h downtime/year) |
| NFR-3.2 | Data durability | 99.999% (replicated PostgreSQL) |
| NFR-3.3 | Zero data loss for messages and CDRs | Required |
| NFR-3.4 | Graceful degradation on provider outage (Telnyx or Twilio) | Required |

### NFR-4: Security

| ID | Requirement | Target |
|----|------------|--------|
| NFR-4.1 | TLS 1.2+ for all external communication | Required |
| NFR-4.2 | Encryption at rest for PII and call recordings | AES-256 |
| NFR-4.3 | OWASP Top 10 compliance | Required |
| NFR-4.4 | SOC 2 Type II readiness | Phase 2 |
| NFR-4.5 | GDPR compliance (data export, deletion) | Required |
| NFR-4.6 | Rate limiting on all public endpoints | Required |
| NFR-4.7 | Tenant data isolation — no cross-tenant queries | Required |

### NFR-5: Observability

| ID | Requirement | Target |
|----|------------|--------|
| NFR-5.1 | Structured logging (JSON) | Required |
| NFR-5.2 | Distributed tracing (OpenTelemetry) | Required |
| NFR-5.3 | Metrics dashboards (Grafana) | Required |
| NFR-5.4 | Error tracking (Sentry) | Required |
| NFR-5.5 | Health check endpoints | Required |

---

## 6. User Flows

### 6.1 Onboarding Flow

```
[Landing Page] → [Sign Up] → [Email Verification] → [Create Workspace]
     → [Choose Phone Number] → [Payment Method] → [Dashboard]
```

### 6.2 Inbound Call Flow

```
[Provider receives call (Telnyx or Twilio)] → [Webhook → P2C API] → [Identify workspace + number]
     → [Apply ring strategy] → [Push WebSocket event to assigned members]
     → [Member answers via WebRTC (provider SDK)] → [Call connected]
     → [If no answer → Voicemail] → [Recording stored + transcribed]
```

### 6.3 Outbound Call Flow

```
[User clicks "Call" in UI] → [Select outbound number]
     → [WebRTC session initiated via provider SDK (Telnyx or Twilio, per workspace config)]
     → [Provider places PSTN call] → [Call connected]
     → [CDR recorded on hangup]
```

### 6.4 Messaging Flow

```
[User types message] → [API POST /messages] → [Provider Messaging API (Telnyx or Twilio)]
     → [Delivery webhook → update status] → [Push via WebSocket to UI]

[Inbound SMS] → [Provider webhook (Telnyx or Twilio)] → [API processes + stores]
     → [WebSocket push to assigned members] → [UI updates conversation]
```

---

## 7. Pricing Model

### 7.1 Structure: Pay-As-You-Go with Optional Plans

| Component | Cost Model |
|-----------|-----------|
| **Platform Access** | Free tier (1 user, 1 number) / Pro tier ($10/workspace/mo for unlimited users) |
| **Phone Numbers** | Provider cost + 20% margin (Telnyx ~$1.20/mo, Twilio ~$1.15/mo for local US number) |
| **Outbound Calls** | Provider cost + 15% margin (Telnyx ~$0.0115/min US, Twilio ~$0.014/min US) |
| **Inbound Calls** | Provider cost + 15% margin (Telnyx ~$0.0058/min US, Twilio ~$0.0085/min US) |
| **SMS Outbound** | Provider cost + 20% margin (Telnyx ~$0.0048/segment, Twilio ~$0.0079/segment) |
| **SMS Inbound** | Free (absorbed) |
| **MMS** | Provider cost + 20% margin |
| **Voicemail Transcription** | Provider or third-party cost + 15% margin |

### 7.2 Billing Mechanics
- Pre-paid credit balance with configurable auto-reload threshold
- Minimum reload amount: $10
- Real-time usage deduction
- Monthly invoice summary via email

---

## 8. Success Metrics (KPIs)

| Metric | Target (6 months post-launch) |
|--------|-------------------------------|
| Registered workspaces | 500 |
| Monthly active workspaces | 200 |
| Monthly recurring revenue (MRR) | $5,000 |
| Avg. revenue per workspace | $25 |
| Onboarding completion rate | > 60% |
| Call setup success rate | > 99% |
| SMS delivery rate | > 98% |
| NPS score | > 40 |
| Churn rate (monthly) | < 5% |

---

## 9. Assumptions & Constraints

### Assumptions
1. Both Telnyx and Twilio provide reliable telephony infrastructure with < 0.1% call failure rate
2. Target market (US/Canada initially) has mature coverage on both Telnyx and Twilio
3. Users have modern browsers with WebRTC support (Chrome, Firefox, Edge, Safari 14+)
4. Initial team size: 1-2 developers; architecture must be simple enough for small team
5. Each workspace is configured with exactly one active provider; cross-provider failover is a Phase 2+ feature

### Constraints
1. **Budget**: Bootstrap / seed-stage — minimize fixed infrastructure costs
2. **Timeline**: MVP in 12-16 weeks with a team of 2
3. **Regulatory**: Must handle 10DLC registration for US SMS (each provider manages respective carrier compliance)
4. **Technical**: WebRTC quality depends on user's network; no control over last-mile
5. **Provider SDK**: Telnyx and Twilio WebRTC SDKs are loaded conditionally per workspace provider config

---

## 10. Risks & Mitigations

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Telnyx API outage | High | Low | Circuit breaker pattern; workspaces on Twilio continue unaffected; future cross-provider failover |
| Twilio API outage | High | Low | Circuit breaker pattern; workspaces on Telnyx continue unaffected |
| Provider pricing change | Medium | Medium | Margin model absorbs minor changes; pricing page reflects actual provider costs |
| WebRTC quality issues | Medium | Medium | Connection quality monitoring; fallback to PSTN-only |
| Regulatory changes (10DLC, STIR/SHAKEN) | Medium | Medium | Abstract telephony layer; each provider handles own carrier compliance |
| Data breach / tenant isolation failure | Critical | Low | Row-level security; penetration testing; audit logging |
| Competitor price war | Medium | Medium | Focus on DX, API-first differentiation, and provider flexibility |

---

## 11. Glossary

| Term | Definition |
|------|-----------|
| **CDR** | Call Detail Record — metadata about a completed call |
| **DTMF** | Dual-Tone Multi-Frequency — touch-tone signals sent during calls |
| **IVR** | Interactive Voice Response — automated phone menu system |
| **PSTN** | Public Switched Telephone Network — traditional phone network |
| **SIP** | Session Initiation Protocol — signaling protocol for voice/video |
| **WebRTC** | Web Real-Time Communication — browser-based audio/video API |
| **10DLC** | 10-Digit Long Code — US carrier registration for business SMS |
| **STIR/SHAKEN** | Caller ID authentication framework to prevent spoofing |

---

## Appendix A: Document Change Log

| Date | Version | Changes | Author |
|------|---------|---------|--------|
| 2026-07-08 | 1.0.0-draft | Initial PRD creation | Principal Architect |
| 2026-07-09 | 1.1.0-draft | Added Twilio as first-class supported provider; updated scope, pricing, risks, user flows | Principal Architect |
