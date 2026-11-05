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
} from '@nestjs/common';
import { CurrentUser, type AuthUser } from '../common/decorators.js';
import { SessionsService } from './sessions.service.js';
import {
  CreateSessionDto,
  SaveSessionDto,
  SubmitTranscriptDto,
  UpdateSessionDto,
} from './sessions.dto.js';

@Controller('sessions')
export class SessionsController {
  constructor(private readonly sessions: SessionsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.sessions.listSaved(user.id);
  }

  @Get('pending')
  pending(@CurrentUser() user: AuthUser) {
    return this.sessions.listPending(user.id);
  }

  @Get('prompts')
  prompts(@CurrentUser() user: AuthUser) {
    return this.sessions.promptCandidates(user.id);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateSessionDto) {
    return this.sessions.create(user.id, dto);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.sessions.get(user.id, id);
  }

  @Post(':id/transcript')
  @HttpCode(HttpStatus.ACCEPTED)
  submitTranscript(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SubmitTranscriptDto,
  ) {
    return this.sessions.submitTranscript(user.id, id, dto);
  }

  @Post(':id/retry')
  @HttpCode(HttpStatus.ACCEPTED)
  retry(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.sessions.retry(user.id, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSessionDto,
  ) {
    return this.sessions.update(user.id, id, dto);
  }

  @Post(':id/save')
  @HttpCode(HttpStatus.OK)
  save(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SaveSessionDto,
  ) {
    return this.sessions.save(user.id, id, dto.keep);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.sessions.remove(user.id, id);
  }
}
