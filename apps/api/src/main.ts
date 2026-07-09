// apps/api/src/main.ts

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import * as dotenv from 'dotenv';

dotenv.config();

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    rawBody: true,
  });

  // Enable CORS for frontend connection
  app.enableCors({
    origin: [
      process.env.FRONTEND_URL || 'http://localhost:5173',
      /\.vercel\.app$/,
    ],
    credentials: true,
  });

  // Global prefix for API versioning
  app.setGlobalPrefix('api/v1', {
    // Exclude /health from the prefix so UptimeRobot can ping it at root level
    exclude: ['health'],
  });

  // Auto-validation for DTOs
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  const port = process.env.PORT || 3001;
  await app.listen(port);
  console.log(`P2C API is running on: http://localhost:${port}/api/v1`);

  // ── Keep-alive self-ping ─────────────────────────────────────────────────
  // Render free tier sleeps after 15 min of inactivity.
  // Ping ourselves every 10 min so we stay awake to receive Telnyx webhooks.
  const selfUrl = process.env.RENDER_EXTERNAL_URL || `http://localhost:${port}`;
  if (process.env.NODE_ENV === 'production') {
    setInterval(async () => {
      try {
        await fetch(`${selfUrl}/health`);
        console.log('[keep-alive] Self-ping sent');
      } catch (e) {
        console.warn('[keep-alive] Self-ping failed:', e);
      }
    }, 10 * 60 * 1000); // every 10 minutes
  }
}

bootstrap();
