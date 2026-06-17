import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { AuthService } from './auth.service';
import { Public, CurrentUser } from './auth.decorators';
import { AuthPrincipal } from './auth.types';

/**
 * Module Z auth endpoints (PLAT-AUTH-001/004).
 *   POST /auth/login  — public; exchanges credentials for a JWT.
 *   GET  /auth/me     — protected; echoes the verified principal.
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
