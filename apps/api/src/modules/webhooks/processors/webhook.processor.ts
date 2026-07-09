import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { EventsGateway } from '../../../gateways/events.gateway';
import { NormalizedWebhookEvent } from '@phone2client/shared';

@Processor('provider-webhooks')
export class WebhookProcessor extends WorkerHost {
  private readonly logger = new Logger(WebhookProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventsGateway: EventsGateway,
  ) {
    super();
  }

  /** Normalise to E.164: ensure leading + and strip formatting */
  private normalizeNumber(num?: string): string {
    if (!num) return '';
    const digits = num.replace(/[^\d]/g, '');
    if (num.startsWith('+')) return `+${digits}`;
    // Assume E.164 without leading + — just add it back
    return `+${digits}`;
  }

  async process(job: Job<NormalizedWebhookEvent>): Promise<any> {
    const event = job.data;
    this.logger.log(`Processing background job for webhook event: ${event.eventType} (${event.providerEventId})`);

    // 1. Idempotency dedup
    const cacheKey = `webhook_processed:${event.provider}:${event.providerEventId}`;
    // For MVP, we can rely on DB unique constraints or basic checks.
    // Let's check if we already processed a message/call event if IDs are present.

    try {
      switch (event.eventType) {
        case 'call.initiated':
          await this.handleCallInitiated(event);
          break;
        case 'call.answered':
          await this.handleCallAnswered(event);
          break;
        case 'call.hangup':
          await this.handleCallHangup(event);
          break;
        case 'message.received':
          await this.handleMessageReceived(event);
          break;
        case 'message.sent':
        case 'message.delivered':
        case 'message.failed':
          await this.handleMessageStatusUpdate(event);
          break;
        default:
          this.logger.warn(`Unhandled webhook event type: ${event.eventType}`);
      }
    } catch (error) {
      this.logger.error(`Error processing webhook event ${event.providerEventId}`, error);
      throw error;
    }
  }

  private async handleCallInitiated(event: NormalizedWebhookEvent) {
    if (!event.providerCallId || !event.toNumber) return;

    const normalizedTo = this.normalizeNumber(event.toNumber);
    const normalizedFrom = this.normalizeNumber(event.fromNumber);

    // Lookup workspace phone number — try exact match then normalized
    const dbPhoneNumber = await this.prisma.phoneNumber.findFirst({
      where: {
        OR: [
          { number: event.toNumber, status: 'ACTIVE' },
          { number: normalizedTo, status: 'ACTIVE' },
        ],
      },
    });

    if (!dbPhoneNumber) {
      this.logger.warn(`Received call event for untracked number: ${event.toNumber} (normalized: ${normalizedTo})`);
      return;
    }

    // Deduplicate: skip if a log for this providerCallId already exists
    const existing = await this.prisma.callLog.findFirst({
      where: { providerCallId: event.providerCallId },
    });
    if (existing) {
      this.logger.log(`Duplicate call.initiated for ${event.providerCallId} — skipping`);
      return;
    }

    // Create call log
    const callLog = await this.prisma.callLog.create({
      data: {
        workspace: { connect: { id: dbPhoneNumber.workspaceId } },
        phoneNumber: { connect: { id: dbPhoneNumber.id } },
        direction: 'INBOUND',
        status: 'RINGING',
        fromNumber: normalizedFrom || event.fromNumber || '',
        toNumber: normalizedTo || event.toNumber,
        providerCallId: event.providerCallId,
      },
    });

    this.logger.log(`Created INBOUND call log ${callLog.id} for ${normalizedFrom} → ${normalizedTo}`);

    // Notify workspace frontend clients in real time
    this.eventsGateway.sendToWorkspace(dbPhoneNumber.workspaceId, 'call:incoming', {
      id: callLog.id,
      fromNumber: callLog.fromNumber,
      toNumber: callLog.toNumber,
      direction: 'INBOUND',
      status: 'RINGING',
      providerCallId: event.providerCallId,
    });
  }

  private async handleCallAnswered(event: NormalizedWebhookEvent) {
    if (!event.providerCallId) return;

    // Try exact match first, then fall back to most recent active call
    let callLog = await this.prisma.callLog.findFirst({
      where: { providerCallId: event.providerCallId },
    });

    if (!callLog && event.toNumber) {
      // WebRTC SDK calls may not have stored providerCallId yet — match by number + active status
      callLog = await this.prisma.callLog.findFirst({
        where: {
          toNumber: event.toNumber,
          status: { in: ['INITIATED', 'RINGING'] },
        },
        orderBy: { startedAt: 'desc' },
      });
    }

    if (!callLog) return;

    await this.prisma.callLog.update({
      where: { id: callLog.id },
      data: {
        status: 'ANSWERED',
        answeredAt: new Date(),
        providerCallId: callLog.providerCallId || event.providerCallId,
      },
    });

    this.eventsGateway.sendToWorkspace(callLog.workspaceId, 'call:state-change', {
      id: callLog.id,
      status: 'ANSWERED',
      providerCallId: event.providerCallId,
    });
  }

  private async handleCallHangup(event: NormalizedWebhookEvent) {
    if (!event.providerCallId) return;

    // Try exact match first, then fall back to most recent active call
    let callLog = await this.prisma.callLog.findFirst({
      where: { providerCallId: event.providerCallId },
    });

    if (!callLog) {
      // WebRTC SDK calls may not have stored providerCallId yet
      callLog = await this.prisma.callLog.findFirst({
        where: {
          status: { in: ['INITIATED', 'RINGING', 'ANSWERED'] },
        },
        orderBy: { startedAt: 'desc' },
      });
    }

    if (!callLog) return;

    const endedAt = new Date();
    const started = callLog.answeredAt || callLog.startedAt;
    const durationSeconds = Math.round((endedAt.getTime() - started.getTime()) / 1000);

    const updated = await this.prisma.callLog.update({
      where: { id: callLog.id },
      data: {
        status: callLog.answeredAt ? 'COMPLETED' : 'MISSED',
        endedAt,
        durationSeconds: event.callDurationSeconds || durationSeconds,
        providerCallId: callLog.providerCallId || event.providerCallId,
      },
    });

    this.eventsGateway.sendToWorkspace(callLog.workspaceId, 'call:state-change', {
      id: callLog.id,
      status: updated.status,
      durationSeconds: updated.durationSeconds,
      providerCallId: event.providerCallId,
    });
  }

  private async handleMessageReceived(event: NormalizedWebhookEvent) {
    if (!event.fromNumber || !event.toNumber || !event.providerMessageId) return;

    // Lookup destination phone number
    const dbPhoneNumber = await this.prisma.phoneNumber.findFirst({
      where: {
        number: event.toNumber,
        status: 'ACTIVE',
      },
    });

    if (!dbPhoneNumber) {
      this.logger.warn(`Received message for untracked number: ${event.toNumber}`);
      return;
    }

    // Lookup or create Conversation
    let conversation = await this.prisma.conversation.findUnique({
      where: {
        workspaceId_phoneNumberId_externalNumber: {
          workspaceId: dbPhoneNumber.workspaceId,
          phoneNumberId: dbPhoneNumber.id,
          externalNumber: event.fromNumber,
        },
      },
    });

    if (!conversation) {
      conversation = await this.prisma.conversation.create({
        data: {
          workspace: { connect: { id: dbPhoneNumber.workspaceId } },
          phoneNumber: { connect: { id: dbPhoneNumber.id } },
          externalNumber: event.fromNumber,
        },
      });
    }

    // Create message record
    const message = await this.prisma.message.create({
      data: {
        workspaceId: dbPhoneNumber.workspaceId,
        conversation: { connect: { id: conversation.id } },
        direction: 'INBOUND',
        status: 'DELIVERED',
        fromNumber: event.fromNumber,
        toNumber: event.toNumber,
        body: event.messageBody,
        providerMessageId: event.providerMessageId,
      },
    });

    // Update last message preview in Conversation
    await this.prisma.conversation.update({
      where: { id: conversation.id },
      data: {
        unreadCount: { increment: 1 },
        lastMessageAt: new Date(),
        lastMessageBody: event.messageBody?.substring(0, 499),
      },
    });

    // Notify clients real-time
    this.eventsGateway.sendToWorkspace(dbPhoneNumber.workspaceId, 'message:new', {
      conversationId: conversation.id,
      message: {
        id: message.id,
        direction: 'INBOUND',
        fromNumber: message.fromNumber,
        toNumber: message.toNumber,
        body: message.body,
        status: 'DELIVERED',
        createdAt: message.createdAt,
      },
    });
  }

  private async handleMessageStatusUpdate(event: NormalizedWebhookEvent) {
    if (!event.providerMessageId) return;

    const message = await this.prisma.message.findUnique({
      where: { providerMessageId: event.providerMessageId },
    });

    if (!message) return;

    let dbStatus = message.status;
    if (event.eventType === 'message.sent') dbStatus = 'SENT';
    else if (event.eventType === 'message.delivered') dbStatus = 'DELIVERED';
    else if (event.eventType === 'message.failed') dbStatus = 'FAILED';

    await this.prisma.message.update({
      where: { id: message.id },
      data: {
        status: dbStatus,
        deliveredAt: event.eventType === 'message.delivered' ? new Date() : undefined,
      },
    });

    // Notify clients
    this.eventsGateway.sendToWorkspace(message.workspaceId, 'message:status', {
      messageId: message.id,
      status: dbStatus,
    });
  }
}
