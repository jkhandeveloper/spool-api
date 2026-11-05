import { Exclude } from 'class-transformer';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
  type Relation,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../users/user.entity.js';

/**
 * Lifecycle:
 *   recording -> processing -> draft -> saved
 *                         \-> failed -> (retry) processing
 * Discarding a draft/failed session deletes the row.
 */
export type SessionStatus =
  'recording' | 'processing' | 'draft' | 'saved' | 'failed';

@Entity('therapy_sessions')
@Index(['userId', 'status', 'createdAt'])
export class TherapySession {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  user: Relation<User>;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'varchar', length: 16, default: 'recording' })
  status: SessionStatus;

  @Column({ type: 'timestamptz' })
  consentConfirmedAt: Date;

  /** Discussion prompts shown during the session (from the week's journal). */
  @Column({ type: 'jsonb', default: () => "'[]'" })
  prompts: string[];

  @Column({ type: 'int', nullable: true })
  durationSeconds: number | null;

  /**
   * On-device transcript. Held only until a summary draft is produced, then
   * erased (the consent script promises this). Never returned by the API.
   */
  @Exclude()
  @Column({ type: 'text', nullable: true, select: false })
  transcript: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  title: string | null;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  topics: string[];

  @Column({ type: 'jsonb', default: () => "'[]'" })
  mainPoints: string[];

  @Column({ type: 'jsonb', default: () => "'[]'" })
  takeaways: string[];

  @Column({ type: 'varchar', length: 280, nullable: true })
  dailyGoal: string | null;

  @Column({ type: 'varchar', length: 280, nullable: true })
  weeklyGoal: string | null;

  @Column({ type: 'varchar', length: 280, nullable: true })
  failureReason: string | null;

  /** For failed sessions: whether the transcript is still held so a retry can run. */
  @Column({ type: 'boolean', default: false })
  canRetry: boolean;

  @Column({ type: 'timestamptz', nullable: true })
  processingStartedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  savedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
