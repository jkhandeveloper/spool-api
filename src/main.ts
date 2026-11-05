import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module.js';
import { setupApp } from './setup-app.js';

async function bootstrap() {
  const app = setupApp(await NestFactory.create(AppModule));
  await app.listen(
    app.get(ConfigService).getOrThrow<number>('port'),
    '0.0.0.0',
  );
}
await bootstrap();
