import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { PrismaService } from '../../prisma.service';
import { AuthService } from './auth.service';
import { TokenService } from './token.service';
import { AuthController } from './auth.controller';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RolesGuard } from './roles.guard';

/**
 * Module Z — authentication & RBAC (PLAT-AUTH-001..005).
 *
 * @Global so TokenService is injectable anywhere without re-importing. Registers
 * TWO global guards; ORDER MATTERS — JwtAuthGuard is listed first so it runs
 * first (populating req.user) before RolesGuard evaluates @Roles()/@Mfa().
 */
@Global()
@Module({
  controllers: [AuthController],
  providers: [
    PrismaService,
    TokenService,
    AuthService,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
  exports: [TokenService, AuthService],
})
export class AuthModule {}
