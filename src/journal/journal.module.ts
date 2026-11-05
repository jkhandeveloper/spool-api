import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JournalEntry } from './journal-entry.entity.js';
import { JournalController } from './journal.controller.js';
import { JournalService } from './journal.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([JournalEntry])],
  controllers: [JournalController],
  providers: [JournalService],
  exports: [JournalService],
})
export class JournalModule {}
