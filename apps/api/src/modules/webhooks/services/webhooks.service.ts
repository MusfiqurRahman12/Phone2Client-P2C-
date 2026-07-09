import { Injectable, UnauthorizedException, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { TelephonyProviderFactory } from '../../telephony/providers/telephony-provider.factory';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { TelephonyProvider } from '@prisma/client';

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly providerFactory: TelephonyProviderFactory,
    @InjectQueue('provider-webhooks') private readonly webhookQueue: Queue,
  ) {}

  async handleWebhook(provider: TelephonyProvider, rawBody: string, signature: string, timestamp: string) {
    // 1. Resolve provider adapter
    const adapter = this.providerFactory.forWorkspace(provider);

    // 2. Verify signature using Ed25519 public key (Telnyx) or auth token (Twilio)
    const publicKeyOrSecret = provider === TelephonyProvider.TELNYX
      ? process.env.TELNYX_PUBLIC_KEY
      : process.env.TWILIO_AUTH_TOKEN;

    if (publicKeyOrSecret && signature) {
      const isValid = adapter.verifyWebhookSignature(rawBody, signature, timestamp, publicKeyOrSecret);
      if (!isValid) {
        this.logger.warn(`Signature verification failed for provider ${provider}`);
        throw new UnauthorizedException('Invalid signature');
      }
    } else {
      this.logger.warn(`Webhook signature check skipped: missing public key/secret or signature header`);
    }

    // 3. Parse payload
    let parsedPayload: any;
    try {
      parsedPayload = JSON.parse(rawBody);
    } catch {
      throw new BadRequestException('Invalid JSON payload');
    }

    const normalizedEvent = adapter.parseWebhookEvent(parsedPayload);

    // 4. Enqueue event for asynchronous processing (database updates, websocket fanout)
    await this.webhookQueue.add('process-event', normalizedEvent, {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 1000,
      },
    });

    this.logger.log(`Enqueued webhook event ${normalizedEvent.providerEventId} from ${provider}`);
    return { status: 'enqueued', eventId: normalizedEvent.providerEventId };
  }
}
