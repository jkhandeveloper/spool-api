import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../users/user.entity.js';
import { JournalModule } from '../journal/journal.module.js';
import { GoalsModule } from '../goals/goals.module.js';
import { SummariesModule } from '../summaries/summaries.module.js';
import { TherapySession } from './therapy-session.entity.js';
import { SessionsController } from './sessions.controller.js';
import { SessionsService } from './sessions.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([TherapySession, User]),
    JournalModule,
    GoalsModule,
    SummariesModule,
  ],
  controllers: [SessionsController],
  providers: [SessionsService],
  exports: [SessionsService],
})
export class SessionsModule {}
