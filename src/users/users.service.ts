import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, MoreThan, Repository } from 'typeorm';
import { AuthService } from '../auth/auth.service.js';
import { JournalEntry } from '../journal/journal-entry.entity.js';
import { TherapySession } from '../sessions/therapy-session.entity.js';
import { Goal } from '../goals/goal.entity.js';
import { Appointment } from '../appointments/appointment.entity.js';
import { User } from './user.entity.js';
import type { UpdateMeDto } from './users.dto.js';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly auth: AuthService,
  ) {}

  async get(id: string): Promise<User> {
    const user = await this.users.findOne({ where: { id } });
    if (!user) throw new NotFoundException();
    return user;
  }

  async update(id: string, dto: UpdateMeDto): Promise<User> {
    const user = await this.get(id);
    if (dto.displayName !== undefined)
      user.displayName = dto.displayName?.trim() || null;
    if (dto.remindersEnabled !== undefined)
      user.remindersEnabled = dto.remindersEnabled;
    if (dto.reminderTime !== undefined) user.reminderTime = dto.reminderTime;
    if (dto.textSize !== undefined) user.textSize = dto.textSize;
    if (dto.reduceMotion !== undefined) user.reduceMotion = dto.reduceMotion;
    if (dto.journalOnly !== undefined) user.journalOnly = dto.journalOnly;
    return this.users.save(user);
  }

  async completePrivacyReview(id: string, journalOnly: boolean): Promise<User> {
    const user = await this.get(id);
    user.privacyReviewedAt = new Date();
    user.journalOnly = journalOnly;
    return this.users.save(user);
  }

  async graduate(id: string): Promise<User> {
    const user = await this.get(id);
    user.graduatedAt ??= new Date();
    await this.users.manager.transaction(async (tx) => {
      // Upcoming appointments no longer apply once someone has graduated.
      await tx.update(
        Appointment,
        { userId: id, startsAt: MoreThan(new Date()), cancelledAt: IsNull() },
        { cancelledAt: new Date() },
      );
      await tx.save(user);
    });
    return user;
  }

  async resumeTherapy(id: string): Promise<User> {
    const user = await this.get(id);
    user.graduatedAt = null;
    return this.users.save(user);
  }

  /** Everything we hold about the user, for the "export my data" control. */
  async exportData(id: string) {
    const m = this.users.manager;
    const [user, journal, sessions, goals, appointments] = await Promise.all([
      this.get(id),
      m.find(JournalEntry, {
        where: { userId: id },
        order: { createdAt: 'ASC' },
      }),
      m.find(TherapySession, {
        where: { userId: id },
        order: { createdAt: 'ASC' },
      }),
      m.find(Goal, {
        where: { userId: id },
        relations: { checkIns: true },
        order: { createdAt: 'ASC' },
      }),
      m.find(Appointment, {
        where: { userId: id, cancelledAt: IsNull() },
        order: { startsAt: 'ASC' },
      }),
    ]);
    return {
      exportedAt: new Date().toISOString(),
      note: 'Session audio is never stored. Transcripts are deleted once a summary draft is created.',
      profile: user,
      journal,
      sessions,
      goals,
      appointments,
    };
  }

  /** Deletes the account; every owned row is removed via ON DELETE CASCADE. */
  async deleteAccount(id: string, password: string): Promise<void> {
    if (!(await this.auth.verifyPassword(id, password))) {
      throw new UnauthorizedException('Password is incorrect');
    }
    await this.users.delete(id);
  }

  /** Deletes journal, sessions, goals and appointments but keeps the account. */
  async deleteAllData(id: string): Promise<void> {
    await this.users.manager.transaction(async (tx) => {
      await tx.delete(Goal, { userId: id });
      await tx.delete(TherapySession, { userId: id });
      await tx.delete(JournalEntry, { userId: id });
      await tx.delete(Appointment, { userId: id });
    });
  }
}
