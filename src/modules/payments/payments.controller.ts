import { Body, Controller, Headers, HttpCode, Post } from '@nestjs/common';
import { PaymentsService } from './payments.service';

@Controller('api/payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  // POST /api/payments/callback   (PAY-API-003)
  @Post('callback')
  @HttpCode(200)
  async callback(
    @Headers('x-signature') signature: string,
    @Body() body: any,
  ) {
    const raw = JSON.stringify(body);
    const signatureValid = this.payments.verifySignature(raw, signature);
    const result = await this.payments.handleCallback({ ...body, signatureValid });
    return { result };
  }
}
