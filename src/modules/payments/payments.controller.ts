import {
  Body,
  Controller,
  Headers,
  HttpCode,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { Public } from '../auth/auth.decorators';

@Controller('api/payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  // POST /api/payments/callback   (PAY-API-003)
  // Machine-to-machine: authenticated by the x-signature HMAC, not a user JWT,
  // so it is @Public to the JWT guard. The handler trusts no client identity —
  // handleCallback runs under a fixed internal 'system' actor.
  @Public()
  @Post('callback')
  @HttpCode(200)
  async callback(
    @Headers('x-signature') signature: string,
    @Body() body: any,
  ) {
    const raw = JSON.stringify(body);
    const signatureValid = this.payments.verifySignature(raw, signature);
    const result = await this.payments.handleCallback({ ...body, signatureValid });
    // PAY-API-008: reject an unverified callback at the HTTP boundary too.
    if (result === 'rejected') {
      throw new UnauthorizedException('Invalid callback signature.');
    }
    return { result };
  }
}
