import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { OnboardingService } from './onboarding.service';
import { CurrentUser, Roles } from '../auth/auth.decorators';
import { AuthPrincipal } from '../auth/auth.types';
import { ROLE_GROUPS } from '../../common/roles';
import {
  AttachDocumentDto,
  KycReviewDto,
  LinkWalletDto,
  OnboardPartyDto,
} from './onboarding.dto';

/**
 * Onboarding workflow endpoints (SRS §4.1a, ONB-001..008).
 * actorId / actorRole are taken from the verified JWT principal (PLAT-AUTH-003)
 * and override anything in the request body.
 */
@Controller('onboarding')
export class OnboardingController {
  constructor(private readonly onboarding: OnboardingService) {}

  private withActor<T>(user: AuthPrincipal, body: T): T {
    return { ...body, actorId: user.actorId, actorRole: user.actorRole };
  }

  // POST /onboarding/parties  (ONB-001 / ONB-007)
  @Roles(...ROLE_GROUPS.registry)
  @Post('parties')
  async onboard(@CurrentUser() user: AuthPrincipal, @Body() body: OnboardPartyDto) {
    return this.onboarding.onboardParty(this.withActor(user, body));
  }

  // GET /onboarding/parties/:id  — onboarding status view
  @Roles(...ROLE_GROUPS.read_registry)
  @Get('parties/:id')
  async getParty(@Param('id') id: string) {
    return this.onboarding.getParty(id);
  }

  // POST /onboarding/parties/:id/documents  (ONB-002)
  @Roles(...ROLE_GROUPS.registry)
  @Post('parties/:id/documents')
  async attachDocument(
    @CurrentUser() user: AuthPrincipal,
    @Param('id') id: string,
    @Body() body: AttachDocumentDto,
  ) {
    return this.onboarding.attachDocument(id, this.withActor(user, body));
  }

  // POST /onboarding/parties/:id/kyc  (ONB-004)
  @Roles('registrar', 'operations', 'sys_admin')
  @Post('parties/:id/kyc')
  async reviewKyc(
    @CurrentUser() user: AuthPrincipal,
    @Param('id') id: string,
    @Body() body: KycReviewDto,
  ) {
    return this.onboarding.reviewKyc(id, this.withActor(user, body));
  }

  // POST /onboarding/parties/:id/wallet  (ONB-003)
  @Roles(...ROLE_GROUPS.registry)
  @Post('parties/:id/wallet')
  async linkWallet(
    @CurrentUser() user: AuthPrincipal,
    @Param('id') id: string,
    @Body() body: LinkWalletDto,
  ) {
    return this.onboarding.linkWallet(id, this.withActor(user, body));
  }
}
