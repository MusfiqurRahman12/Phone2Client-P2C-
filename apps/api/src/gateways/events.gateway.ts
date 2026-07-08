import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { Logger, UseGuards } from '@nestjs/common';
import { PrismaService } from '../infrastructure/database/prisma.service';

@WebSocketGateway({
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    credentials: true,
  },
})
export class EventsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(EventsGateway.name);

  @WebSocketServer()
  server: Server;

  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async handleConnection(client: Socket) {
    try {
      const token = client.handshake.auth.token || client.handshake.query.token;
      
      if (!token) {
        client.disconnect();
        return;
      }

      // Verify token
      const payload = this.jwtService.verify(token, {
        secret: process.env.JWT_SECRET || 'p2c_jwt_super_secret_session_key_123456!',
      });

      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        include: {
          workspaceMembers: true,
        },
      });

      if (!user) {
        client.disconnect();
        return;
      }

      // Attach user information to socket client
      client.data.user = {
        id: user.id,
        email: user.email,
      };

      // Automatically join client to their workspaces rooms
      for (const member of user.workspaceMembers) {
        const room = `workspace:${member.workspaceId}`;
        await client.join(room);
        this.logger.log(`Client ${client.id} (User: ${user.id}) joined room: ${room}`);
      }

      this.logger.log(`Client connected: ${client.id} (User: ${user.id})`);
    } catch (error) {
      this.logger.warn(`Connection rejected for client ${client.id}: ${error.message}`);
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  // Broadcast helper
  sendToWorkspace(workspaceId: string, event: string, payload: any) {
    const room = `workspace:${workspaceId}`;
    this.server.to(room).emit(event, payload);
    this.logger.log(`Emitted event "${event}" to room: ${room}`);
  }
}
