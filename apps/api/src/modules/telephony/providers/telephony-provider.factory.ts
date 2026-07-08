import { Injectable } from '@nestjs/common';
import { ITelephonyProvider } from '../../../common/interfaces/telephony-provider.interface';
import { TelnyxService } from '../../../infrastructure/telephony/telnyx/telnyx.service';
import { TelephonyProvider } from '@prisma/client';

@Injectable()
export class TelephonyProviderFactory {
  constructor(
    private readonly telnyxService: TelnyxService,
  ) {}

  forWorkspace(providerType: TelephonyProvider): ITelephonyProvider {
    switch (providerType) {
      case TelephonyProvider.TELNYX:
        return this.telnyxService;
      case TelephonyProvider.TWILIO:
        throw new Error('Twilio integration is scheduled for post-MVP phase.');
      default:
        throw new Error(`Unsupported telephony provider: ${providerType}`);
    }
  }
}
