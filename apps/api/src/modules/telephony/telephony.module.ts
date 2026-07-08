import { Module } from '@nestjs/common';
import { CallsController } from './controllers/calls.controller';
import { CallsService } from './services/calls.service';
import { PhoneNumbersModule } from '../phone-numbers/phone-numbers.module';
import { TelnyxModule } from '../../infrastructure/telephony/telnyx/telnyx.module';

@Module({
  imports: [PhoneNumbersModule, TelnyxModule],
  controllers: [CallsController],
  providers: [CallsService],
  exports: [CallsService],
})
export class TelephonyModule {}
