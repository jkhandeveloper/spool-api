import { Controller, Get, Query } from '@nestjs/common';
import { CurrentUser, type AuthUser } from '../common/decorators.js';
import { UsersService } from '../users/users.service.js';
import { AppointmentsService } from '../appointments/appointments.service.js';
import { GoalsService } from '../goals/goals.service.js';
import { JournalService } from '../journal/journal.service.js';
import { SessionsService } from '../sessions/sessions.service.js';
import { MEDITATIONS } from '../meditations/meditations.data.js';

const REMINDERS = [
  'You are safe.',
  'You are allowed to rest.',
  'Small steps still count.',
  'Your feelings make sense.',
  'You can take this one moment at a time.',
  'You deserve the care you give others.',
  'It is okay to ask for what you need.',
];

/** Aggregates everything the Today screen (01) needs in one request. */
@Controller('today')
export class TodayController {
  constructor(
    private readonly users: UsersService,
    private readonly appts: AppointmentsService,
    private readonly goals: GoalsService,
    private readonly journal: JournalService,
    private readonly sessions: SessionsService,
  ) {}

  /** `hour` is the client's local hour (0-23) so the right meditation is suggested. */
  @Get()
  async today(
    @CurrentUser() authUser: AuthUser,
    @Query('hour') hourParam?: string,
  ) {
    const parsed = parseInt(hourParam ?? '', 10);
    const hour = Number.isNaN(parsed)
      ? new Date().getHours()
      : Math.min(23, Math.max(0, parsed));
    const weekAgo = new Date(Date.now() - 7 * 86_400_000);

    const [user, nextAppointment, goals, journalThisWeek, pending] =
      await Promise.all([
        this.users.get(authUser.id),
        this.appts.next(authUser.id),
        this.goals.listActive(authUser.id),
        this.journal.countSince(authUser.id, weekAgo),
        this.sessions.listPending(authUser.id),
      ]);

    const dayIndex = Math.floor(Date.now() / 86_400_000);
    const timeOfDay = hour < 12 ? 'morning' : hour >= 17 ? 'evening' : 'any';
    const meditation =
      MEDITATIONS.find((m) => m.timeOfDay === timeOfDay) ?? MEDITATIONS[0];

    return {
      user,
      reminder: REMINDERS[dayIndex % REMINDERS.length],
      meditation: {
        id: meditation.id,
        label:
          timeOfDay === 'evening'
            ? 'Evening meditation'
            : timeOfDay === 'morning'
              ? 'Morning meditation'
              : 'Meditation',
        title: meditation.title,
        durationSeconds: meditation.durationSeconds,
      },
      nextAppointment,
      goals,
      journalThisWeek,
      pendingSession: pending[0] ?? null,
    };
  }
}
