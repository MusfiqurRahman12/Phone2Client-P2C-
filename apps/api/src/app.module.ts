// apps/api/src/app.module.ts

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './infrastructure/database/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { WorkspaceModule } from './modules/workspace/workspace.module';
import { PhoneNumbersModule } from './modules/phone-numbers/phone-numbers.module';
import { EventsModule } from './gateways/events.module';
import { BullModule } from '@nestjs/bullmq';
import { WebhooksModule } from './modules/webhooks/webhooks.module';
import { TelephonyModule } from './modules/telephony/telephony.module';
import { MessagingModule } from './modules/messaging/messaging.module';
import { HealthController } from './common/controllers/health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    PrismaModule,
    AuthModule,
    WorkspaceModule,
    PhoneNumbersModule,
    EventsModule,
    BullModule.forRootAsync({
      useFactory: () => {
        const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
        try {
          const parsed = new URL(redisUrl);
          return {
            connection: {
              host: parsed.hostname || 'localhost',
              port: parsed.port ? parseInt(parsed.port, 10) : 6379,
              password: parsed.password || undefined,
              ...(parsed.protocol === 'rediss:' ? { tls: {} } : {}),
            },
          };
        } catch {
          return {
            connection: {
              host: 'localhost',
              port: 6379,
            },
          };
        }
      },
    }),
    WebhooksModule,
    TelephonyModule,
    MessagingModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
