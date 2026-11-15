import { Controller, Get, Query } from '@nestjs/common';
import { CurrentUser, type AuthUser } from '../common/decorators.js';
import { AnalyticsQuery } from '../admin/admin.dto.js';
import { AnalyticsService } from './analytics.service.js';

@Controller('me')
export class InsightsController {
  constructor(private readonly analytics: AnalyticsService) {}

  /** The signed-in user's own activity analytics. */
  @Get('insights')
  insights(@CurrentUser() user: AuthUser, @Query() q: AnalyticsQuery) {
    return this.analytics.insights(user.id, q.days ?? 30, q.tz ?? 'UTC');
  }
}
