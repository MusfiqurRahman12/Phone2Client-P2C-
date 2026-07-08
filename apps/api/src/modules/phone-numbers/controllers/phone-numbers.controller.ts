import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { PhoneNumbersService } from '../services/phone-numbers.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../../common/guards/tenant.guard';
import { CurrentWorkspaceId } from '../../../common/decorators/current-workspace-id.decorator';

@Controller('phone-numbers')
@UseGuards(JwtAuthGuard, TenantGuard)
export class PhoneNumbersController {
  constructor(private readonly phoneNumbersService: PhoneNumbersService) {}

  @Get('search')
  async search(
    @CurrentWorkspaceId() workspaceId: string,
    @Query('country_code') country: string,
    @Query('area_code') areaCode?: string,
    @Query('type') type?: 'local' | 'toll_free' | 'mobile',
    @Query('contains') contains?: string,
    @Query('limit') limit?: string,
  ) {
    return this.phoneNumbersService.searchNumbers(workspaceId, {
      country: country || 'US',
      areaCode,
      numberType: type,
      contains,
      limit: limit ? parseInt(limit, 10) : 10,
    });
  }

  @Post()
  async purchase(
    @CurrentWorkspaceId() workspaceId: string,
    @Body('number') number: string,
    @Body('friendly_name') friendlyName?: string,
    @Body('ring_strategy') ringStrategy?: 'SIMULTANEOUS' | 'SEQUENTIAL' | 'ROUND_ROBIN',
    @Body('ring_timeout') ringTimeout?: number,
  ) {
    return this.phoneNumbersService.purchaseNumber(
      workspaceId,
      number,
      friendlyName,
      ringStrategy,
      ringTimeout,
    );
  }

  @Get()
  async list(@CurrentWorkspaceId() workspaceId: string) {
    return this.phoneNumbersService.listNumbers(workspaceId);
  }

  @Post(':phoneNumberId/assignments')
  async assign(
    @Param('phoneNumberId') phoneNumberId: string,
    @Body('member_id') memberId: string,
    @Body('priority') priority?: number,
  ) {
    return this.phoneNumbersService.assignMember(phoneNumberId, memberId, priority);
  }

  @Delete(':phoneNumberId/assignments/:memberId')
  async unassign(
    @Param('phoneNumberId') phoneNumberId: string,
    @Param('memberId') memberId: string,
  ) {
    return this.phoneNumbersService.removeAssignment(phoneNumberId, memberId);
  }

  @Delete(':phoneNumberId')
  async release(
    @CurrentWorkspaceId() workspaceId: string,
    @Param('phoneNumberId') phoneNumberId: string,
  ) {
    return this.phoneNumbersService.releaseNumber(workspaceId, phoneNumberId);
  }
}
