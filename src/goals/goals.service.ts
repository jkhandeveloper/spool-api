import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { type EntityManager, MoreThanOrEqual, Repository } from 'typeorm';
import { Goal, type GoalCadence } from './goal.entity.js';
import { GoalCheckIn } from './goal-check-in.entity.js';
import type { CreateCheckInDto, UpdateGoalDto } from './goals.dto.js';

export interface GoalView extends Goal {
  /** Whether the goal has been checked in as done within its current period. */
  doneThisPeriod: boolean;
}

export function periodStart(cadence: GoalCadence, now = new Date()): Date {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  if (cadence === 'weekly') start.setDate(start.getDate() - 6);
  return start;
}

@Injectable()
export class GoalsService {
  constructor(
    @InjectRepository(Goal) private readonly goals: Repository<Goal>,
    @InjectRepository(GoalCheckIn)
    private readonly checkIns: Repository<GoalCheckIn>,
  ) {}

  async listActive(userId: string): Promise<GoalView[]> {
    const goals = await this.goals.find({
      where: { userId, active: true },
      order: { cadence: 'ASC', createdAt: 'DESC' },
    });
    return Promise.all(goals.map((g) => this.withPeriodStatus(g)));
  }

  listAll(userId: string): Promise<Goal[]> {
    return this.goals.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: 100,
    });
  }

  async get(userId: string, id: string) {
    const goal = await this.goals.findOne({
      where: { id, userId },
      relations: { checkIns: true },
      order: { checkIns: { createdAt: 'DESC' } },
    });
    if (!goal) throw new NotFoundException('Goal not found');
    return this.withPeriodStatus(goal);
  }

  async create(
    userId: string,
    cadence: GoalCadence,
    text: string,
  ): Promise<Goal> {
    return this.goals.manager.transaction((tx) =>
      this.replaceActive(tx, userId, null, { [cadence]: text }),
    );
  }

  async update(
    userId: string,
    id: string,
    dto: UpdateGoalDto,
  ): Promise<GoalView> {
    const goal = await this.goals.findOneBy({ id, userId });
    if (!goal) throw new NotFoundException('Goal not found');
    if (dto.text !== undefined) goal.text = dto.text;
    if (dto.completed !== undefined) {
      goal.completedAt = dto.completed
        ? (goal.completedAt ?? new Date())
        : null;
      if (dto.completed) goal.active = false;
    }
    await this.goals.save(goal);
    return this.get(userId, id);
  }

  async checkIn(
    userId: string,
    id: string,
    dto: CreateCheckInDto,
  ): Promise<GoalCheckIn> {
    const goal = await this.goals.findOneBy({ id, userId });
    if (!goal) throw new NotFoundException('Goal not found');
    return this.checkIns.save(
      this.checkIns.create({
        goalId: goal.id,
        completed: dto.completed,
        reflection: dto.reflection || null,
      }),
    );
  }

  /**
   * Makes the given goals the active ones, retiring any previous active goal
   * with the same cadence. Returns the first goal created.
   */
  async replaceActive(
    tx: EntityManager,
    userId: string,
    sessionId: string | null,
    texts: Partial<Record<GoalCadence, string | null>>,
  ): Promise<Goal> {
    const created: Goal[] = [];
    for (const cadence of ['daily', 'weekly'] as const) {
      const text = texts[cadence]?.trim();
      if (!text) continue;
      await tx.update(
        Goal,
        { userId, cadence, active: true },
        { active: false },
      );
      created.push(
        await tx.save(
          tx.create(Goal, { userId, sessionId, cadence, text, active: true }),
        ),
      );
    }
    return created[0];
  }

  private async withPeriodStatus(goal: Goal): Promise<GoalView> {
    const doneThisPeriod = await this.checkIns.exists({
      where: {
        goalId: goal.id,
        completed: true,
        createdAt: MoreThanOrEqual(periodStart(goal.cadence)),
      },
    });
    return Object.assign(goal, { doneThisPeriod });
  }
}
