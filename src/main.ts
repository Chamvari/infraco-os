import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module';
import { mfaEnforced } from './modules/auth/auth.constants';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('', { exclude: [] });
  await app.listen(process.env.PORT ?? 3000);
  // eslint-disable-next-line no-console
  console.log(`InfraCo OS API listening on ${process.env.PORT ?? 3000}`);

  // Never let MFA be off silently in an environment that matters.
  if (!mfaEnforced()) {
    Logger.warn(
      'MFA_ENFORCED=false — multi-factor authentication is DISABLED: no forced ' +
        'enrolment at login, and @Mfa step-up actions pass on role checks alone. ' +
        'Set MFA_ENFORCED=true to arm it.',
      'Security',
    );
  }
}
bootstrap();
