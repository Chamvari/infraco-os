import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { AuthService } from './auth.service';
import { Public, CurrentUser } from './auth.decorators';
import { AuthPrincipal } from './auth.types';

/**
 * Module Z auth endpoints (PLAT-AUTH-001/003/004).
 *   POST /auth/login        — public; exchanges credentials for an mfa:false JWT.
 *   POST /auth/mfa/enroll    — protected; begins TOTP enrolment (otpauth URI).
 *   POST /auth/mfa/verify    — protected; mints a stepped-up mfa:true JWT.
 *   GET  /auth/me            — protected; echoes the verified principal.
 */
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  async login(@Body() body: { username: string; password: string }) {
    return this.auth.login(body?.username, body?.password);
  }

  // PLAT-AUTH-003 — enrol a TOTP authenticator for the current user. Requires a
  // valid first-factor token (global JwtAuthGuard); identity comes server-side.
  @Post('mfa/enroll')
  @HttpCode(200)
  async enrollMfa(@CurrentUser() user: AuthPrincipal) {
    return this.auth.enrollMfa(user.actorId);
  }

  // PLAT-AUTH-003 — present a TOTP code to step up to an mfa:true token.
  @Post('mfa/verify')
  @HttpCode(200)
  async verifyMfa(
    @CurrentUser() user: AuthPrincipal,
    @Body() body: { code: string },
  ) {
    return this.auth.verifyMfa(user.actorId, body?.code);
  }

  // Requires a valid token (global JwtAuthGuard); proves identity is server-side.
  @Get('me')
  async me(@CurrentUser() user: AuthPrincipal) {
    return {
      userId: user.actorId,
      role: user.actorRole,
      roles: user.roles,
      mfa: user.mfa,
      username: user.username,
    };
  }
}
