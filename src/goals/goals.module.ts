import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Goal } from './goal.entity.js';
import { GoalCheckIn } from './goal-check-in.entity.js';
import { GoalsController } from './goals.controller.js';
import { GoalsService } from './goals.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([Goal, GoalCheckIn])],
  controllers: [GoalsController],
  providers: [GoalsService],
  exports: [GoalsService],
})
export class GoalsModule {}
