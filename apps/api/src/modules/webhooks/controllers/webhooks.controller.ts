import { Controller, Post, Headers, Req, HttpCode, HttpStatus } from '@nestjs/common';
import { WebhooksService } from '../services/webhooks.service';
import { TelephonyProvider } from '@prisma/client';
import { Request } from 'express';

@Controller('webhooks')
export class WebhooksController {
  constructor(private readonly webhooksService: WebhooksService) {}

  @Post('telnyx')
  @HttpCode(HttpStatus.OK)
  async handleTelnyx(
    @Headers('telnyx-signature-ed25519') signature: string,
    @Headers('telnyx-timestamp') timestamp: string,
    @Req() req: Request & { rawBody?: Buffer },
  ) {
    const rawBody = req.rawBody ? req.rawBody.toString('utf8') : JSON.stringify(req.body);
    return this.webhooksService.handleWebhook(
      TelephonyProvider.TELNYX,
      rawBody,
      signature,
      timestamp,
    );
  }

  @Post('twilio')
  @HttpCode(HttpStatus.OK)
  async handleTwilio(
    @Headers('x-twilio-signature') signature: string,
    @Req() req: Request & { rawBody?: Buffer },
  ) {
    const rawBody = req.rawBody ? req.rawBody.toString('utf8') : JSON.stringify(req.body);
    return this.webhooksService.handleWebhook(
      TelephonyProvider.TWILIO,
      rawBody,
      signature,
      '', // Twilio uses HMAC, not Ed25519 timestamps
    );
  }
}
