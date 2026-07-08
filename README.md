# Phone2Client (P2C)

Phone2Client (P2C) is a multi-tenant, cloud-native communications SaaS platform that enables businesses to manage calls, SMS/MMS, and voicemail through a unified web interface. 

The system is designed with a **provider-agnostic telephony abstraction layer**, supporting both **Telnyx** and **Twilio** as first-class backends. This allows workspaces/tenants to use their preferred telephony provider, optimizing for cost, geographic coverage, or existing infrastructure integrations.

## Repository Structure

- `docs/` — Core architecture, design, and specification documents.
  - [01-PRD.md](docs/01-PRD.md) — Product Requirements Document.
  - [02-system-architecture.md](docs/02-system-architecture.md) — High-Level System Architecture and Design.
  - [03-database-schema.md](docs/03-database-schema.md) — Database Models & Prisma Schema design.
  - [04-api-specification.md](docs/04-api-specification.md) — API endpoints and schemas.
  - [06-telephony-provider-abstraction.md](docs/06-telephony-provider-abstraction.md) — Design details on the multi-provider telephony abstraction interface (`ITelephonyProvider`) and adapters.

## Key Features

- **Multi-Tenancy (Row-Level Isolation)**: Robust tenant isolation using PostgreSQL Row-Level Security (RLS) and Prisma query mapping.
- **Provider-Agnostic Telephony**: Swap backend providers (Telnyx/Twilio) dynamically per workspace.
- **WebRTC voice calling**: Receive and place phone calls directly in the browser via lazy-loaded provider-specific SDKs.
- **Shared Inboxes (SMS/MMS)**: Threaded messaging with media support shared across workspace team members.
- **Real-Time Communication**: Push events (incoming call alerts, messaging status, active presence) delivered via Socket.io.
- **Pre-Paid Balance System**: Passthrough usage billing with Stripe integration.
