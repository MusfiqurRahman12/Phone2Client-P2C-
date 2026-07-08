import { Module } from '@nestjs/common';
import { PhoneNumbersController } from './controllers/phone-numbers.controller';
import { PhoneNumbersService } from './services/phone-numbers.service';
import { TelephonyProviderFactory } from '../telephony/providers/telephony-provider.factory';
import { TelnyxModule } from '../../infrastructure/telephony/telnyx/telnyx.module';

@Module({
  imports: [TelnyxModule],
  controllers: [PhoneNumbersController],
  providers: [PhoneNumbersService, TelephonyProviderFactory],
  exports: [PhoneNumbersService, TelephonyProviderFactory],
})
export class PhoneNumbersModule {}
