import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentUser, type AuthUser } from '../common/decorators.js';
import { AppointmentsService } from './appointments.service.js';
import {
  CreateAppointmentDto,
  ListAppointmentsQuery,
  UpdateAppointmentDto,
} from './appointments.dto.js';

@Controller('appointments')
export class AppointmentsController {
  constructor(private readonly appts: AppointmentsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() q: ListAppointmentsQuery) {
    return this.appts.list(user.id, q.from, q.to);
  }

  @Get('next')
  async next(@CurrentUser() user: AuthUser) {
    return { appointment: await this.appts.next(user.id) };
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateAppointmentDto) {
    return this.appts.create(user.id, dto);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.appts.get(user.id, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAppointmentDto,
  ) {
    return this.appts.update(user.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async cancel(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.appts.cancel(user.id, id);
  }
}
