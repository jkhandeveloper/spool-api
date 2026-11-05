import {
  ClassSerializerInterceptor,
  type INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';

/** Shared by main.ts and the e2e tests so both run the same pipeline. */
export function setupApp(app: INestApplication): INestApplication {
  const config = app.get(ConfigService);
  app.setGlobalPrefix('api/v1');
  app.use(helmet());
  const origins = config.get<string[]>('corsOrigins') ?? [];
  if (origins.length) app.enableCors({ origin: origins });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  // Honors @Exclude() on entities (password hash, token version, transcript).
  app.useGlobalInterceptors(new ClassSerializerInterceptor(app.get(Reflector)));
  app.enableShutdownHooks();
  return app;
}
