import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { DataSource } from 'typeorm';
import { Public } from '../common/decorators.js';

@Public()
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(private readonly db: DataSource) {}

  @Get()
  async check() {
    try {
      await this.db.query('SELECT 1');
    } catch {
      throw new ServiceUnavailableException({
        status: 'error',
        database: 'down',
      });
    }
    return { status: 'ok' };
  }
}
