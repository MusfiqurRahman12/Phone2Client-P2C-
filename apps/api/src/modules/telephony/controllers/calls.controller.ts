import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { CallsService } from '../services/calls.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../../common/guards/tenant.guard';
import { CurrentWorkspaceId } from '../../../common/decorators/current-workspace-id.decorator';
import { CurrentUser, AuthenticatedUser } from '../../../common/decorators/current-user.decorator';

@Controller('calls')
@UseGuards(JwtAuthGuard, TenantGuard)
export class CallsController {
  constructor(private readonly callsService: CallsService) {}

  @Get('history')
  async getHistory(@CurrentWorkspaceId() workspaceId: string) {
    return this.callsService.getCallHistory(workspaceId);
  }

  @Post('token')
  async getToken(
    @CurrentWorkspaceId() workspaceId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.callsService.getWebRtcToken(workspaceId, user.id);
  }

  @Post('outbound')
  async initiate(
    @CurrentWorkspaceId() workspaceId: string,
    @Body('from_number_id') fromNumberId: string,
    @Body('to_number') toNumber: string,
  ) {
    return this.callsService.initiateOutboundCall(workspaceId, fromNumberId, toNumber);
  }

  @Post(':callId/hangup')
  async hangup(
    @CurrentWorkspaceId() workspaceId: string,
    @Param('callId') callId: string,
  ) {
    await this.callsService.hangupCall(workspaceId, callId);
    return { success: true };
  }
}
