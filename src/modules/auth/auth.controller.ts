import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { AuthService } from './auth.service';
import {
  Public,
  CurrentUser,
  ClientIp,
  Roles,
  ForcedFlowExempt,
} from './auth.decorators';
import { AuthPrincipal } from './auth.types';

/**
 * Module Z auth endpoints (PLAT-AUTH-001/003/004/005).
 *   POST /auth/login            — public; credentials → mfa:false JWT (rate-limited).
 *   POST /auth/change-password  — forced reset AND everyday self-service.
 *   POST /auth/mfa/enroll        — begin TOTP enrolment (otpauth URI).
 *   POST /auth/mfa/verify        — present a code → stepped-up mfa:true JWT.
 *   POST /auth/mfa/reset         — sys_admin only; reset a user's MFA (audited).
 *   GET  /auth/me               — echoes the verified principal + forced-flow flags.
 */
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  async login(
    @Body() body: { username: string; password: string },
    @ClientIp() ip?: string,
  ) {
    return this.auth.login(body?.username, body?.password, ip);
  }

  /**
   * Change password — serves the forced first-login reset AND everyday
   * self-service. Reachable while a forced password change is pending
   * (@ForcedFlowExempt('password')); clears the flag and issues a fresh token.
   */
  @ForcedFlowExempt('password')
  @Post('change-password')
  @HttpCode(200)
  async changePassword(
    @CurrentUser() user: AuthPrincipal,
    @Body() body: { currentPassword: string; newPassword: string },
    @ClientIp() ip?: string,
  ) {
    return this.auth.changePassword(
      user.actorId,
      body?.currentPassword,
      body?.newPassword,
      ip,
    );
  }

  // PLAT-AUTH-003 — enrol a TOTP authenticator. Reachable while MFA enrolment is
  // mandated (@ForcedFlowExempt('mfa')); identity comes server-side.
  @ForcedFlowExempt('mfa')
  @Post('mfa/enroll')
  @HttpCode(200)
  async enrollMfa(@CurrentUser() user: AuthPrincipal) {
    return this.auth.enrollMfa(user.actorId);
  }

  // PLAT-AUTH-003 — present a TOTP code to step up to an mfa:true token (and, on
  // first success, activate MFA).
  @ForcedFlowExempt('mfa')
  @Post('mfa/verify')
  @HttpCode(200)
  async verifyMfa(
    @CurrentUser() user: AuthPrincipal,
    @Body() body: { code: string },
    @ClientIp() ip?: string,
  ) {
    return this.auth.verifyMfa(user.actorId, body?.code, ip);
  }

  // PLAT-AUTH-005 — admin MFA reset (lost-device recovery). sys_admin only; the
  // reset bumps the target's token_version (forcing re-login) and is audited.
  @Roles('sys_admin')
  @Post('mfa/reset')
  @HttpCode(200)
  async resetMfa(
    @CurrentUser() user: AuthPrincipal,
    @Body() body: { userId: string },
    @ClientIp() ip?: string,
  ) {
    return this.auth.resetMfa(user.actorId, String(user.actorRole), body?.userId, ip);
  }

  // Requires a valid token; always reachable (even mid-forced-flow) so the client
  // can read its own pending gates.
  @ForcedFlowExempt()
  @Get('me')
  async me(@CurrentUser() user: AuthPrincipal) {
    return {
      userId: user.actorId,
      role: user.actorRole,
      roles: user.roles,
      mfa: user.mfa,
      username: user.username,
      mustChangePassword: user.mustChange ?? false,
      mustEnrolMfa: user.mustEnrolMfa ?? false,
    };
  }
}
