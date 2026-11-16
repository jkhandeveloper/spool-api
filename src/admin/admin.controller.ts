import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  ServiceUnavailableException,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Throttle } from '@nestjs/throttler';
import { createHash, timingSafeEqual } from 'node:crypto';
import { Public } from '../common/decorators.js';
import { AnalyticsService } from '../analytics/analytics.service.js';
import { AdminGuard, type AdminPayload } from './admin.guard.js';
import { AdminLoginDto, AdminUsersQuery, AnalyticsQuery } from './admin.dto.js';

/** Constant-time string comparison (hashing first equalizes the lengths). */
function safeEqual(a: string, b: string): boolean {
  const h = (s: string) => createHash('sha256').update(s).digest();
  return timingSafeEqual(h(a), h(b));
}

// @Public() skips the user JwtAuthGuard; AdminGuard protects everything but login.
@Public()
@Controller('admin')
export class AdminController {
  constructor(
    private readonly analytics: AnalyticsService,
    private readonly config: ConfigService,
    private readonly jwt: JwtService,
  ) {}

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: AdminLoginDto) {
    const username = this.config.get<string>('admin.username') ?? 'admin';
    const password = this.config.get<string>('admin.password') ?? '';
    if (!password)
      throw new ServiceUnavailableException('Admin login is not configured');
    const ok =
      safeEqual(dto.username, username) && safeEqual(dto.password, password);
    if (!ok)
      throw new UnauthorizedException('Username or password is incorrect');
    const ttl = this.config.get<string>('admin.tokenTtl') ?? '8h';
    const payload: AdminPayload = { sub: 'admin', username, typ: 'admin' };
    const accessToken = await this.jwt.signAsync(payload, {
      secret: this.config.getOrThrow<string>('jwt.accessSecret'),
      expiresIn: ttl as never,
    });
    return { accessToken, username };
  }

  @UseGuards(AdminGuard)
  @Get('analytics')
  overview(@Query() q: AnalyticsQuery) {
    return this.analytics.overview(q.days ?? 30, q.tz ?? 'UTC');
  }

  @UseGuards(AdminGuard)
  @Get('users')
  users(@Query() q: AdminUsersQuery) {
    return this.analytics.users(q);
  }

  @UseGuards(AdminGuard)
  @Get('users/:id')
  user(@Param('id', ParseUUIDPipe) id: string, @Query() q: AnalyticsQuery) {
    return this.analytics.user(id, q.days ?? 90, q.tz ?? 'UTC');
  }

  @UseGuards(AdminGuard)
  @Delete('users/:id')
  deleteUser(@Param('id', ParseUUIDPipe) id: string) {
    return this.analytics.deleteUser(id);
  }
}
