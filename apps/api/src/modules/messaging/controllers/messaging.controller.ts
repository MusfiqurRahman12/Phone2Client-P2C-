import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { MessagingService } from '../services/messaging.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../../common/guards/tenant.guard';
import { CurrentWorkspaceId } from '../../../common/decorators/current-workspace-id.decorator';
import { Request } from 'express';

@Controller()
@UseGuards(JwtAuthGuard, TenantGuard)
export class MessagingController {
  constructor(private readonly messagingService: MessagingService) {}

  @Get('conversations')
  async listConversations(@CurrentWorkspaceId() workspaceId: string) {
    return this.messagingService.listConversations(workspaceId);
  }

  @Get('conversations/:conversationId/messages')
  async listMessages(
    @CurrentWorkspaceId() workspaceId: string,
    @Param('conversationId') conversationId: string,
  ) {
    return this.messagingService.listMessages(workspaceId, conversationId);
  }

  @Post('messages')
  async send(
    @CurrentWorkspaceId() workspaceId: string,
    @Body('from_number_id') fromNumberId: string,
    @Body('to_number') toNumber: string,
    @Body('body') body: string,
    @Req() req: Request & { workspaceMember?: { id: string } },
  ) {
    const memberId = req.workspaceMember?.id;
    return this.messagingService.sendSms(
      workspaceId,
      fromNumberId,
      toNumber,
      body,
      memberId,
    );
  }
}
