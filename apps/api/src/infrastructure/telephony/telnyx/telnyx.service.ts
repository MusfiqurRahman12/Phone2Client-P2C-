import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ITelephonyProvider } from '../../../common/interfaces/telephony-provider.interface';
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

// Import Telnyx dynamically or instantiate it
const Telnyx = require('telnyx');

@Injectable()
export class TelnyxService implements ITelephonyProvider {
  private readonly logger = new Logger(TelnyxService.name);
  readonly type: TelephonyProviderType = 'TELNYX';
  private telnyxClient: any;

  constructor() {
    const apiKey = process.env.TELNYX_API_KEY || 'KEY_MOCK_VAL';
    this.telnyxClient = Telnyx(apiKey);
  }

  private isMockKey(): boolean {
    const key = process.env.TELNYX_API_KEY;
    return !key || key.startsWith('KEY_MOCK') || key === 'KEY018...';
  }

  async searchAvailableNumbers(params: SearchNumbersParams): Promise<AvailableNumber[]> {
    if (this.isMockKey()) {
      this.logger.log('Mock Telnyx API key detected. Returning simulated available numbers.');
      return [
        {
          number: '+14155551001',
          friendlyName: '(415) 555-1001',
          type: 'local',
          monthlyRate: 100, // $1.00
          capabilities: { voice: true, sms: true, mms: false },
        },
        {
          number: '+14155551002',
          friendlyName: '(415) 555-1002',
          type: 'local',
          monthlyRate: 100,
          capabilities: { voice: true, sms: true, mms: true },
        },
        {
          number: '+18005559001',
          friendlyName: '(800) 555-9001',
          type: 'toll_free',
          monthlyRate: 200, // $2.00
          capabilities: { voice: true, sms: true, mms: false },
        },
      ];
    }

    try {
      const response = await this.telnyxClient.availablePhoneNumbers.list({
        filter: {
          country_code: params.country || 'US',
          phone_number_type: params.numberType || 'local',
          area_code: params.areaCode,
          contains: params.contains,
        },
        page: { size: params.limit || 10 },
      });

      return response.data.map((item: any) => ({
        number: item.phone_number,
        friendlyName: item.phone_number,
        type: (item.phone_number_type?.toLowerCase() === 'toll-free' ? 'toll_free' : 'local') as any,
        monthlyRate: 100, // standard estimate
        capabilities: {
          voice: item.features?.includes('voice') || false,
          sms: item.features?.includes('sms') || false,
          mms: item.features?.includes('mms') || false,
        },
      }));
    } catch (error) {
      this.logger.error('Failed to search available numbers from Telnyx API', error);
      throw error;
    }
  }

  async purchaseNumber(params: PurchaseNumberParams): Promise<PurchasedNumber> {
    if (this.isMockKey()) {
      this.logger.log(`Mock purchase of phone number: ${params.number}`);
      return {
        providerNumberId: `mock_num_${Math.random().toString(36).substring(7)}`,
        providerOrderId: `mock_order_${Math.random().toString(36).substring(7)}`,
        number: params.number,
        monthlyRate: 100,
      };
    }

    try {
      // 1. Order the phone number
      const order = await this.telnyxClient.numberOrders.create({
        phone_numbers: [{ phone_number: params.number }],
      });

      // Retrieve number ID once ordered (may require a brief polling or returned order data)
      const providerOrderId = order.data.id;
      const providerNumberId = order.data.phone_numbers?.[0]?.id || `num_${providerOrderId}`;

      return {
        providerNumberId,
        providerOrderId,
        number: params.number,
        monthlyRate: 100,
      };
    } catch (error) {
      this.logger.error(`Failed to purchase number ${params.number} via Telnyx`, error);
      throw error;
    }
  }

  async releaseNumber(providerNumberId: string): Promise<void> {
    if (this.isMockKey()) {
      this.logger.log(`Mock release of number ID: ${providerNumberId}`);
      return;
    }

    try {
      await this.telnyxClient.phoneNumbers.delete(providerNumberId);
    } catch (error) {
      this.logger.error(`Failed to release number ID ${providerNumberId} via Telnyx`, error);
      throw error;
    }
  }

  async initiateCall(params: InitiateCallParams): Promise<CallResult> {
    if (this.isMockKey()) {
      this.logger.log(`Mock outbound call from ${params.from} to ${params.to}`);
      return {
        providerCallId: `mock_call_${Math.random().toString(36).substring(7)}`,
      };
    }

    const connectionId = process.env.TELNYX_CONNECTION_ID;
    if (!connectionId) {
      throw new Error('TELNYX_CONNECTION_ID environment variable is not set');
    }

    try {
      this.logger.log(`Initiating Telnyx call: from=${params.from}, to=${params.to}, connection_id=${connectionId}`);
      const call = await this.telnyxClient.calls.create({
        connection_id: connectionId,
        to: params.to,
        from: params.from,
        webhook_url: `${params.webhookBaseUrl}/telnyx`,
        webhook_url_method: 'POST',
      });

      return {
        providerCallId: call.data.call_control_id,
      };
    } catch (error: any) {
      const telnyxErrors = error?.raw?.errors || error?.errors;
      const isSipConnectionError = telnyxErrors?.some(
        (e: any) => e.code === '10015' || (e.detail && e.detail.includes('connection_id')),
      );

      if (isSipConnectionError) {
        this.logger.warn(
          `TELNYX_CONNECTION_ID ${connectionId} is a SIP / Credential Connection, not a Call Control App. Bypassing calls.create and falling back to direct WebRTC dialing.`,
        );
        return {
          providerCallId: `sip_call_${Math.random().toString(36).substring(7)}`,
        };
      }

      this.logger.error(
        `Failed to initiate Telnyx call from ${params.from} to ${params.to}: ${JSON.stringify(telnyxErrors || error?.message || error)}`,
      );
      throw error;
    }
  }

  async hangupCall(providerCallId: string): Promise<void> {
    if (this.isMockKey() || providerCallId.startsWith('mock_') || providerCallId.startsWith('sip_call_')) {
      this.logger.log(`Mock or SIP hangup of call ID: ${providerCallId}`);
      return;
    }

    try {
      // In Call Control, commands are actions sent to a call control ID
      const call = new this.telnyxClient.Call({ call_control_id: providerCallId });
      await call.hangup();
    } catch (error) {
      this.logger.error(`Failed to hang up Telnyx call ID ${providerCallId}`, error);
      throw error;
    }
  }

  async generateWebRtcToken(workspaceId: string, userId: string): Promise<WebRtcToken> {
    const mockExpires = new Date();
    mockExpires.setHours(mockExpires.getHours() + 1);

    if (this.isMockKey()) {
      this.logger.log(`Mock generate WebRTC SIP token for user ${userId} in workspace ${workspaceId}`);
      return {
        token: `mock_sip_token_${workspaceId}_${userId}`,
        expiresAt: mockExpires.toISOString(),
      };
    }

    // ── Option 1: Use pre-configured SIP credentials from env vars ────────
    // Most reliable — create credentials once in Telnyx portal and store them
    const envSipUser = process.env.TELNYX_SIP_USERNAME;
    const envSipPass = process.env.TELNYX_SIP_PASSWORD;
    if (envSipUser && envSipPass) {
      this.logger.log(`Using pre-configured SIP credentials for workspace ${workspaceId}`);
      // Encode as JSON so the frontend can extract login/password
      return {
        token: `sip:${envSipUser}:${envSipPass}`,
        expiresAt: mockExpires.toISOString(),
      };
    }

    // ── Option 2: On-demand credential creation via Telnyx API ───────────
    try {
      const response = await this.telnyxClient.telephonyCredentials.create({
        name: `p2c_${workspaceId}_${userId}_${Date.now()}`,
      });

      const credData = response.data;
      this.logger.log(`Created on-demand Telnyx credential: ${credData?.id}`);

      // Telnyx returns sip_username + sip_password (not a JWT token field)
      const sipUser = credData?.sip_username;
      const sipPass = credData?.sip_password;

      if (sipUser && sipPass) {
        return {
          token: `sip:${sipUser}:${sipPass}`,
          expiresAt: mockExpires.toISOString(),
        };
      }

      // If token field exists (some API versions), use it directly
      if (credData?.token) {
        return {
          token: credData.token,
          expiresAt: mockExpires.toISOString(),
        };
      }

      throw new Error(`Telnyx credential API returned no usable token. Response: ${JSON.stringify(credData)}`);
    } catch (error) {
      this.logger.error(`Failed to generate WebRTC token for workspace ${workspaceId}: ${error?.message || error}`);
      // Fall back to mock so UI stays functional
      return {
        token: `mock_sip_token_${workspaceId}_${userId}`,
        expiresAt: mockExpires.toISOString(),
      };
    }
  }

  async sendSms(params: SendSmsParams): Promise<MessageResult> {
    if (this.isMockKey()) {
      this.logger.log(`Mock SMS sent from ${params.from} to ${params.to}: ${params.body}`);
      return {
        providerMessageId: `mock_msg_${Math.random().toString(36).substring(7)}`,
      };
    }

    try {
      const response = await this.telnyxClient.messages.create({
        from: params.from,
        to: params.to,
        text: params.body,
        messaging_profile_id: params.messagingProfileId || process.env.TELNYX_MESSAGING_PROFILE_ID,
      });

      return {
        providerMessageId: response.data.id,
      };
    } catch (error: any) {
      const telnyxErrors = error?.raw?.errors || error?.errors;
      const errorMsg = telnyxErrors 
        ? JSON.stringify(telnyxErrors) 
        : error?.message || 'Unknown Telnyx error';
      this.logger.error(`Failed to send SMS from ${params.from} to ${params.to}: ${errorMsg}`, error);
      throw new BadRequestException(`Telnyx SMS failed: ${errorMsg}`);
    }
  }

  verifyWebhookSignature(rawBody: string, signature: string, timestamp: string, publicKey: string): boolean {
    if (this.isMockKey()) {
      // In local dev without keys, always return true to make testing simple
      return true;
    }

    if (!signature || !timestamp || !publicKey) {
      this.logger.warn('Missing signature, timestamp, or public key for webhook verification');
      return false;
    }

    try {
      // Telnyx uses Ed25519 public key cryptography for webhook verification.
      // The SDK's constructEvent method verifies the signature using the public key + timestamp.
      const Telnyx = require('telnyx');
      Telnyx.Webhooks.signature.verifySignature(rawBody, signature, timestamp, publicKey);
      return true;
    } catch (error) {
      this.logger.error('Failed to verify Telnyx webhook signature', error);
      return false;
    }
  }

  parseWebhookEvent(rawPayload: any): NormalizedWebhookEvent {
    const data = rawPayload.data;
    const eventType = rawPayload.data?.event_type;
    const payload = rawPayload.data?.payload;

    let normalizedType: any = 'message.sent'; // default fallback

    if (eventType === 'call.initiated') normalizedType = 'call.initiated';
    else if (eventType === 'call.answered') normalizedType = 'call.answered';
    else if (eventType === 'call.hangup') normalizedType = 'call.hangup';
    else if (eventType === 'call.machine.detection') normalizedType = 'call.machine_detected';
    else if (eventType === 'message.received') normalizedType = 'message.received';
    else if (eventType === 'message.sent') normalizedType = 'message.sent';
    else if (eventType === 'message.finalized') normalizedType = 'message.delivered';

    return {
      eventType: normalizedType,
      provider: 'TELNYX',
      providerEventId: data?.id || `evt_${Math.random().toString(36).substring(7)}`,
      providerCallId: payload?.call_control_id || payload?.call_session_id,
      providerMessageId: payload?.id,
      fromNumber: payload?.from?.phone_number || payload?.from,
      toNumber: payload?.to?.[0]?.phone_number || payload?.to,
      callDurationSeconds: payload?.duration,
      callStatus: payload?.state,
      messageBody: payload?.text,
      rawPayload,
      occurredAt: rawPayload.meta?.occurred_at || new Date().toISOString(),
    };
  }
}
