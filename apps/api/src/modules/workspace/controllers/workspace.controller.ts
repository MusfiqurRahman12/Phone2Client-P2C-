import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { WorkspaceService } from '../services/workspace.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../../common/guards/tenant.guard';
import { CurrentUser, AuthenticatedUser } from '../../../common/decorators/current-user.decorator';
import { CurrentWorkspaceId } from '../../../common/decorators/current-workspace-id.decorator';

@Controller('workspaces')
@UseGuards(JwtAuthGuard)
export class WorkspaceController {
  constructor(private readonly workspaceService: WorkspaceService) {}

  @Post()
  async createWorkspace(
    @CurrentUser() user: AuthenticatedUser,
    @Body('name') name: string,
    @Body('timezone') timezone?: string,
  ) {
    return this.workspaceService.createWorkspace(user.id, name, timezone);
  }

  @Get('me')
  @UseGuards(TenantGuard)
  async getWorkspaceDetails(@CurrentWorkspaceId() workspaceId: string) {
    return this.workspaceService.getWorkspaceById(workspaceId);
  }

  @Get('me/members')
  @UseGuards(TenantGuard)
  async getWorkspaceMembers(@CurrentWorkspaceId() workspaceId: string) {
    return this.workspaceService.getMembers(workspaceId);
  }
}
