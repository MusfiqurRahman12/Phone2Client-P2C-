import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { TelephonyProviderFactory } from '../providers/telephony-provider.factory';

@Injectable()
export class CallsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly providerFactory: TelephonyProviderFactory,
  ) {}

  private async getProviderForWorkspace(workspaceId: string) {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
    });

    if (!workspace) {
      throw new NotFoundException('Workspace not found');
    }

    return this.providerFactory.forWorkspace(workspace.telephonyProvider);
  }

  async getWebRtcToken(workspaceId: string, userId: string) {
    const provider = await this.getProviderForWorkspace(workspaceId);
    return provider.generateWebRtcToken(workspaceId, userId);
  }

  async initiateOutboundCall(workspaceId: string, fromNumberId: string, toNumber: string) {
    const provider = await this.getProviderForWorkspace(workspaceId);

    // Sanitize destination phone number to E.164 format
    const digits = toNumber.replace(/\D/g, '');
    const cleanToNumber = toNumber.startsWith('+') ? `+${digits}` : (digits.length === 10 ? `+1${digits}` : `+${digits}`);
    
    // Verify phone number exists and belongs to workspace
    const dbPhoneNumber = await this.prisma.phoneNumber.findFirst({
      where: {
        id: fromNumberId,
        workspaceId,
        status: 'ACTIVE',
      },
    });

    if (!dbPhoneNumber) {
      throw new BadRequestException('Invalid from_number_id');
    }

    const webhookBaseUrl = process.env.TELEPHONY_WEBHOOK_BASE_URL || 'http://localhost:3001/api/v1/webhooks';

    // 1. Save local Call Log as INITIATED
    const callLog = await this.prisma.callLog.create({
      data: {
        workspace: { connect: { id: workspaceId } },
        phoneNumber: { connect: { id: dbPhoneNumber.id } },
        direction: 'OUTBOUND',
        status: 'INITIATED',
        fromNumber: dbPhoneNumber.number,
        toNumber: cleanToNumber,
      },
    });

    try {
      // 2. Trigger outbound call in provider (which dials the destination and hooks up call control)
      const result = await provider.initiateCall({
        from: dbPhoneNumber.number,
        to: cleanToNumber,
        workspaceId,
        webhookBaseUrl,
      });

      // Update providerCallId
      await this.prisma.callLog.update({
        where: { id: callLog.id },
        data: {
          providerCallId: result.providerCallId,
        },
      });

      return {
        id: callLog.id,
        direction: 'OUTBOUND',
        status: 'INITIATED',
        fromNumber: dbPhoneNumber.number,
        toNumber,
        providerCallId: result.providerCallId,
        startedAt: callLog.createdAt,
      };
    } catch (error) {
      // Mark as failed if provider fails
      await this.prisma.callLog.update({
        where: { id: callLog.id },
        data: {
          status: 'FAILED',
          endedAt: new Date(),
        },
      });
      throw error;
    }
  }

  async hangupCall(workspaceId: string, callId: string) {
    const callLog = await this.prisma.callLog.findFirst({
      where: { id: callId, workspaceId },
    });

    if (!callLog) {
      throw new NotFoundException('Call log not found');
    }

    if (!callLog.providerCallId) {
      throw new BadRequestException('Call cannot be hung up (no active provider session)');
    }

    const provider = await this.getProviderForWorkspace(workspaceId);
    await provider.hangupCall(callLog.providerCallId);
  }

  async getCallHistory(workspaceId: string) {
    return this.prisma.callLog.findMany({
      where: { workspaceId },
      orderBy: { startedAt: 'desc' },
      take: 50,
      include: {
        phoneNumber: true,
      },
    });
  }
}
