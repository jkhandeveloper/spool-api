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
import { JournalService } from './journal.service.js';
import {
  CreateJournalEntryDto,
  ListJournalQuery,
  UpdateJournalEntryDto,
} from './journal.dto.js';

@Controller('journal')
export class JournalController {
  constructor(private readonly journal: JournalService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() q: ListJournalQuery) {
    return this.journal.list(user.id, q.limit, q.offset);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateJournalEntryDto) {
    return this.journal.create(user.id, dto);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.journal.get(user.id, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateJournalEntryDto,
  ) {
    return this.journal.update(user.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.journal.remove(user.id, id);
  }
}
