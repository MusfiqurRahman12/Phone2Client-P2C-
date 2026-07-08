import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { TelephonyProviderFactory } from '../../telephony/providers/telephony-provider.factory';
import { SearchNumbersParams } from '@phone2client/shared';

@Injectable()
export class PhoneNumbersService {
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

  async searchNumbers(workspaceId: string, params: SearchNumbersParams) {
    const provider = await this.getProviderForWorkspace(workspaceId);
    return provider.searchAvailableNumbers(params);
  }

  async purchaseNumber(
    workspaceId: string,
    number: string,
    friendlyName?: string,
    ringStrategy: 'SIMULTANEOUS' | 'SEQUENTIAL' | 'ROUND_ROBIN' = 'SIMULTANEOUS',
    ringTimeout = 30,
  ) {
    const provider = await this.getProviderForWorkspace(workspaceId);
    const webhookBaseUrl = process.env.TELEPHONY_WEBHOOK_BASE_URL || 'http://localhost:3001/api/v1/webhooks';

    // 1. Call provider API to purchase
    const result = await provider.purchaseNumber({
      number,
      workspaceId,
      webhookBaseUrl,
    });

    // 2. Save in database
    const workspace = await this.prisma.workspace.findUnique({ where: { id: workspaceId } });

    return this.prisma.phoneNumber.create({
      data: {
        workspace: { connect: { id: workspaceId } },
        number,
        friendlyName: friendlyName || number,
        type: number.startsWith('+18') ? 'TOLL_FREE' : 'LOCAL',
        countryCode: 'US',
        ringStrategy,
        ringTimeout,
        provider: workspace!.telephonyProvider,
        providerNumberId: result.providerNumberId,
        providerOrderId: result.providerOrderId,
        capabilities: { voice: true, sms: true, mms: false },
      },
    });
  }

  async listNumbers(workspaceId: string) {
    return this.prisma.phoneNumber.findMany({
      where: {
        workspaceId,
        status: { not: 'RELEASED' },
      },
      include: {
        assignments: {
          include: {
            member: {
              include: {
                user: true,
              },
            },
          },
        },
      },
    });
  }

  async assignMember(phoneNumberId: string, memberId: string, priority = 0) {
    return this.prisma.phoneNumberAssignment.create({
      data: {
        phoneNumberId,
        memberId,
        priority,
      },
    });
  }

  async removeAssignment(phoneNumberId: string, memberId: string) {
    return this.prisma.phoneNumberAssignment.delete({
      where: {
        phoneNumberId_memberId: {
          phoneNumberId,
          memberId,
        },
      },
    });
  }

  async releaseNumber(workspaceId: string, phoneNumberId: string) {
    const phoneNumber = await this.prisma.phoneNumber.findUnique({
      where: { id: phoneNumberId },
    });

    if (!phoneNumber || phoneNumber.workspaceId !== workspaceId) {
      throw new NotFoundException('Phone number not found in this workspace');
    }

    const provider = await this.getProviderForWorkspace(workspaceId);
    
    if (phoneNumber.providerNumberId) {
      await provider.releaseNumber(phoneNumber.providerNumberId);
    }

    return this.prisma.phoneNumber.update({
      where: { id: phoneNumberId },
      data: {
        status: 'RELEASED',
        releasedAt: new Date(),
      },
    });
  }
}
