import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentUser, type AuthUser } from '../common/decorators.js';
import { GoalsService } from './goals.service.js';
import { CreateCheckInDto, CreateGoalDto, UpdateGoalDto } from './goals.dto.js';

@Controller('goals')
export class GoalsController {
  constructor(private readonly goals: GoalsService) {}

  /** Active goals by default; `?all=true` includes retired and completed ones. */
  @Get()
  list(@CurrentUser() user: AuthUser, @Query('all') all?: string) {
    return all === 'true'
      ? this.goals.listAll(user.id)
      : this.goals.listActive(user.id);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateGoalDto) {
    return this.goals.create(user.id, dto.cadence, dto.text);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.goals.get(user.id, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateGoalDto,
  ) {
    return this.goals.update(user.id, id, dto);
  }

  @Post(':id/check-ins')
  checkIn(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateCheckInDto,
  ) {
    return this.goals.checkIn(user.id, id, dto);
  }
}
