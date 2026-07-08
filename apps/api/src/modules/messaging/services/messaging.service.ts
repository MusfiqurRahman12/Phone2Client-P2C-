import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { TelephonyProviderFactory } from '../../telephony/providers/telephony-provider.factory';
import { EventsGateway } from '../../../gateways/events.gateway';

@Injectable()
export class MessagingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly providerFactory: TelephonyProviderFactory,
    private readonly eventsGateway: EventsGateway,
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

  async listConversations(workspaceId: string) {
    return this.prisma.conversation.findMany({
      where: { workspaceId },
      include: {
        phoneNumber: {
          select: {
            id: true,
            number: true,
            friendlyName: true,
          },
        },
      },
      orderBy: {
        lastMessageAt: 'desc',
      },
    });
  }

  async listMessages(workspaceId: string, conversationId: string) {
    const conversation = await this.prisma.conversation.findFirst({
      where: { id: conversationId, workspaceId },
    });

    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    return this.prisma.message.findMany({
      where: { conversationId },
      orderBy: {
        createdAt: 'asc',
      },
    });
  }

  async sendSms(
    workspaceId: string,
    fromNumberId: string,
    toNumber: string,
    body: string,
    memberId?: string,
  ) {
    const provider = await this.getProviderForWorkspace(workspaceId);

    // Verify sender phone number
    const dbPhoneNumber = await this.prisma.phoneNumber.findFirst({
      where: {
        id: fromNumberId,
        workspaceId,
        status: 'ACTIVE',
      },
      include: {
        workspace: {
          include: {
            providerConfig: true,
          },
        },
      },
    });

    if (!dbPhoneNumber) {
      throw new BadRequestException('Invalid from_number_id');
    }

    // Find or create conversation
    let conversation = await this.prisma.conversation.findUnique({
      where: {
        workspaceId_phoneNumberId_externalNumber: {
          workspaceId,
          phoneNumberId: dbPhoneNumber.id,
          externalNumber: toNumber,
        },
      },
    });

    if (!conversation) {
      conversation = await this.prisma.conversation.create({
        data: {
          workspace: { connect: { id: workspaceId } },
          phoneNumber: { connect: { id: dbPhoneNumber.id } },
          externalNumber: toNumber,
        },
      });
    }

    // Create queued local Message
    const message = await this.prisma.message.create({
      data: {
        workspaceId,
        conversation: { connect: { id: conversation.id } },
        direction: 'OUTBOUND',
        status: 'QUEUED',
        fromNumber: dbPhoneNumber.number,
        toNumber,
        body,
        sentById: memberId,
      },
    });

    try {
      // Trigger provider send SMS
      const result = await provider.sendSms({
        from: dbPhoneNumber.number,
        to: toNumber,
        body,
        workspaceId,
        messagingProfileId: dbPhoneNumber.workspace.providerConfig?.telnyxMessagingProfileId || undefined,
      });

      // Update message state
      const updated = await this.prisma.message.update({
        where: { id: message.id },
        data: {
          status: 'SENT',
          providerMessageId: result.providerMessageId,
          sentAt: new Date(),
        },
      });

      // Update conversation preview
      await this.prisma.conversation.update({
        where: { id: conversation.id },
        data: {
          lastMessageAt: new Date(),
          lastMessageBody: body.substring(0, 499),
        },
      });

      // Broadcast event via Socket.io
      this.eventsGateway.sendToWorkspace(workspaceId, 'message:new', {
        conversationId: conversation.id,
        message: {
          id: updated.id,
          direction: 'OUTBOUND',
          fromNumber: updated.fromNumber,
          toNumber: updated.toNumber,
          body: updated.body,
          status: 'SENT',
          createdAt: updated.createdAt,
        },
      });

      return updated;
    } catch (error) {
      await this.prisma.message.update({
        where: { id: message.id },
        data: {
          status: 'FAILED',
        },
      });
      throw error;
    }
  }
}
