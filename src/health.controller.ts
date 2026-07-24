import { Controller, Get } from '@nestjs/common';
import { Public } from './modules/auth/auth.decorators';

/**
 * Liveness probe for the container healthcheck and ops monitoring.
 * @Public() bypasses the global JwtAuthGuard (registered as APP_GUARD in the
 * @Global AuthModule); without it the route 401s. Cheap — does not touch the DB.
 * The empty global prefix (see main.ts) means @Controller('api') + @Get('health')
 * resolves to exactly /api/health, which nginx proxies through to the API.
 */
@Controller('api')
export class HealthController {
  @Public()
  @Get('health')
  health(): { status: string } {
    return { status: 'ok' };
  }
}
