import { Module, Global } from '@nestjs/common';
import { SmsService } from './sms.service';

/** Global so any InfraCo module (vending, leasing, onboarding, auth) can inject SmsService. */
@Global()
@Module({ providers: [SmsService], exports: [SmsService] })
export class SmsModule {}
