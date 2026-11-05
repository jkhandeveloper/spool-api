import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';
import { setupApp } from './setup-app.js';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  // Behind nginx: take the client IP from X-Forwarded-For so per-IP rate
  // limits apply to each user, not to the proxy. Value = number of proxy hops.
  const trustProxy = parseInt(process.env.TRUST_PROXY ?? '0', 10);
  if (trustProxy > 0) app.set('trust proxy', trustProxy);
  setupApp(app);
  await app.listen(
    app.get(ConfigService).getOrThrow<number>('port'),
    '0.0.0.0',
  );
}
await bootstrap();
