import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AnalyticsService } from '../analytics/analytics.service.js';
import { InsightsController } from '../analytics/insights.controller.js';
import { AdminController } from './admin.controller.js';
import { AdminGuard } from './admin.guard.js';

@Module({
  imports: [JwtModule.register({})],
  controllers: [AdminController, InsightsController],
  providers: [AnalyticsService, AdminGuard],
})
export class AdminModule {}
