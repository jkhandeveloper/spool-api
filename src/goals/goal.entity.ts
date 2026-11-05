import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  type Relation,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../users/user.entity.js';
import { TherapySession } from '../sessions/therapy-session.entity.js';
import { GoalCheckIn } from './goal-check-in.entity.js';

export type GoalCadence = 'daily' | 'weekly';

@Entity('goals')
@Index(['userId', 'active'])
export class Goal {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  user: Relation<User>;

  @Column({ type: 'uuid' })
  userId: string;

  @ManyToOne(() => TherapySession, { onDelete: 'SET NULL', nullable: true })
  session: Relation<TherapySession> | null;

  @Column({ type: 'uuid', nullable: true })
  sessionId: string | null;

  @Column({ type: 'varchar', length: 8 })
  cadence: GoalCadence;

  @Column({ type: 'varchar', length: 280 })
  text: string;

  /** Only one goal per cadence is active; a new session's goals replace the old ones. */
  @Column({ type: 'boolean', default: true })
  active: boolean;

  @Column({ type: 'timestamptz', nullable: true })
  completedAt: Date | null;

  @OneToMany(() => GoalCheckIn, (c) => c.goal)
  checkIns: Relation<GoalCheckIn[]>;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
