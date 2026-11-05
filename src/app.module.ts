import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import configuration from './config/configuration.js';
import { entities } from './database/entities.js';
import { migrations } from './database/migrations/index.js';
import { AuthModule } from './auth/auth.module.js';
import { UsersModule } from './users/users.module.js';
import { JournalModule } from './journal/journal.module.js';
import { SessionsModule } from './sessions/sessions.module.js';
import { GoalsModule } from './goals/goals.module.js';
import { AppointmentsModule } from './appointments/appointments.module.js';
import { MeditationsController } from './meditations/meditations.controller.js';
import { TodayController } from './today/today.controller.js';
import { HealthController } from './health/health.controller.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      cache: true,
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const synchronize =
          config.get<boolean>('database.synchronize') ?? false;
        return {
          type: 'postgres' as const,
          url: config.getOrThrow<string>('database.url'),
          entities,
          migrations,
          synchronize,
          migrationsRun: !synchronize,
        };
      },
    }),
    ThrottlerModule.forRoot({
      throttlers: [{ ttl: 60_000, limit: 120 }],
      skipIf: () => process.env.NODE_ENV === 'test',
    }),
    AuthModule,
    UsersModule,
    JournalModule,
    SessionsModule,
    GoalsModule,
    AppointmentsModule,
  ],
  controllers: [MeditationsController, TodayController, HealthController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
