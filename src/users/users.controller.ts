import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
} from '@nestjs/common';
import { CurrentUser, type AuthUser } from '../common/decorators.js';
import { UsersService } from './users.service.js';
import {
  DeleteAccountDto,
  PrivacyReviewDto,
  UpdateMeDto,
} from './users.dto.js';

@Controller('me')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  me(@CurrentUser() user: AuthUser) {
    return this.users.get(user.id);
  }

  @Patch()
  update(@CurrentUser() user: AuthUser, @Body() dto: UpdateMeDto) {
    return this.users.update(user.id, dto);
  }

  @Post('privacy-review')
  @HttpCode(HttpStatus.OK)
  privacyReview(@CurrentUser() user: AuthUser, @Body() dto: PrivacyReviewDto) {
    return this.users.completePrivacyReview(user.id, dto.journalOnly);
  }

  @Post('graduate')
  @HttpCode(HttpStatus.OK)
  graduate(@CurrentUser() user: AuthUser) {
    return this.users.graduate(user.id);
  }

  @Delete('graduate')
  resume(@CurrentUser() user: AuthUser) {
    return this.users.resumeTherapy(user.id);
  }

  @Get('export')
  export(@CurrentUser() user: AuthUser) {
    return this.users.exportData(user.id);
  }

  @Delete('data')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteData(@CurrentUser() user: AuthUser) {
    await this.users.deleteAllData(user.id);
  }

  // POST rather than DELETE so the password can travel in a body reliably.
  @Post('delete-account')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteAccount(
    @CurrentUser() user: AuthUser,
    @Body() dto: DeleteAccountDto,
  ) {
    await this.users.deleteAccount(user.id, dto.password);
  }
}
