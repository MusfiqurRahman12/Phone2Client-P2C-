import {
  AvailableNumber,
  CallResult,
  InitiateCallParams,
  MessageResult,
  NormalizedWebhookEvent,
  PurchaseNumberParams,
  PurchasedNumber,
  SearchNumbersParams,
  SendSmsParams,
  TelephonyProviderType,
  WebRtcToken,
} from '@phone2client/shared';

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

  // Webhooks
  verifyWebhookSignature(rawBody: string, signature: string, timestamp: string, publicKey: string): boolean;
  parseWebhookEvent(rawPayload: any): NormalizedWebhookEvent;
}
