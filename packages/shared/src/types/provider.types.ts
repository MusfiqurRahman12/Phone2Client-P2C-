export type TelephonyProviderType = 'TELNYX' | 'TWILIO';

export interface SearchNumbersParams {
  country: string; // ISO 3166-1 alpha-2 (e.g. 'US')
  areaCode?: string;
  contains?: string; // number pattern search
  limit?: number;
  numberType?: 'local' | 'toll_free' | 'mobile';
}

export interface AvailableNumber {
  number: string; // E.164
  friendlyName: string;
  type: 'local' | 'toll_free' | 'mobile';
  monthlyRate: number; // USD cents
  capabilities: {
    voice: boolean;
    sms: boolean;
    mms: boolean;
  };
}

export interface PurchaseNumberParams {
  number: string; // E.164
  workspaceId: string;
  webhookBaseUrl: string;
}

export interface PurchasedNumber {
  providerNumberId: string;
  providerOrderId?: string;
  number: string;
  monthlyRate: number; // USD cents
}

export interface InitiateCallParams {
  from: string; // E.164
  to: string; // E.164
  workspaceId: string;
  webhookBaseUrl: string;
  answeredByHuman?: boolean;
}

export interface CallResult {
  providerCallId: string;
}

export interface WebRtcToken {
  token: string; // Provider-issued credential
  expiresAt: string; // ISO String
}

export interface SendSmsParams {
  from: string; // E.164
  to: string; // E.164
  body: string;
  workspaceId: string;
  messagingProfileId?: string;
}

export interface MessageResult {
  providerMessageId: string;
}

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
  providerEventId: string; // Unique per provider; used for dedup
  providerCallId?: string;
  providerMessageId?: string;
  fromNumber?: string; // E.164
  toNumber?: string; // E.164
  callDurationSeconds?: number;
  callStatus?: string;
  messageBody?: string;
  rawPayload: any; // Original provider payload
  occurredAt: string; // ISO String
}
