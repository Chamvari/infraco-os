import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { OnboardingService } from './onboarding.service';
import {
  AttachDocumentDto,
  KycReviewDto,
  LinkWalletDto,
  OnboardPartyDto,
} from './onboarding.dto';

/**
 * Onboarding workflow endpoints (SRS §4.1a, ONB-001..008).
 * actorId / actorRole arrive in the body for now (Phase 1 scaffold); a Module Z
 * auth guard will supply them from the authenticated principal later.
 */
@Controller('onboarding')
export class OnboardingController {
  constructor(private readonly onboarding: OnboardingService) {}

  // POST /onboarding/parties  (ONB-001 / ONB-007)
  @Post('parties')
  async onboard(@Body() body: OnboardPartyDto) {
    return this.onboarding.onboardParty(body);
  }

  // GET /onboarding/parties/:id  — onboarding status view
  @Get('parties/:id')
  async getParty(@Param('id') id: string) {
    return this.onboarding.getParty(id);
  }

  // POST /onboarding/parties/:id/documents  (ONB-002)
  @Post('parties/:id/documents')
  async attachDocument(@Param('id') id: string, @Body() body: AttachDocumentDto) {
    return this.onboarding.attachDocument(id, body);
  }

  // POST /onboarding/parties/:id/kyc  (ONB-004)
  @Post('parties/:id/kyc')
  async reviewKyc(@Param('id') id: string, @Body() body: KycReviewDto) {
    return this.onboarding.reviewKyc(id, body);
  }

  // POST /onboarding/parties/:id/wallet  (ONB-003)
  @Post('parties/:id/wallet')
  async linkWallet(@Param('id') id: string, @Body() body: LinkWalletDto) {
    return this.onboarding.linkWallet(id, body);
  }
}
