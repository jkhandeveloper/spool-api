import { User } from '../users/user.entity.js';
import { PasswordReset } from '../auth/password-reset.entity.js';
import { JournalEntry } from '../journal/journal-entry.entity.js';
import { TherapySession } from '../sessions/therapy-session.entity.js';
import { Goal } from '../goals/goal.entity.js';
import { GoalCheckIn } from '../goals/goal-check-in.entity.js';
import { Appointment } from '../appointments/appointment.entity.js';

export const entities = [
  User,
  PasswordReset,
  JournalEntry,
  TherapySession,
  Goal,
  GoalCheckIn,
  Appointment,
];
