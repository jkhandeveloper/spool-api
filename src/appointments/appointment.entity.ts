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

export type AppointmentKind = 'in_person' | 'video' | 'phone';

@Entity('appointments')
@Index(['userId', 'startsAt'])
export class Appointment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  user: Relation<User>;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'varchar', length: 120, default: 'Therapy appointment' })
  title: string;

  @Column({ type: 'timestamptz' })
  startsAt: Date;

  @Column({ type: 'int', default: 50 })
  durationMinutes: number;

  @Column({ type: 'varchar', length: 12, default: 'in_person' })
  kind: AppointmentKind;

  @Column({ type: 'varchar', length: 200, nullable: true })
  location: string | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  /** Minutes before start to remind the user; null = no reminder. */
  @Column({ type: 'int', nullable: true, default: 60 })
  reminderMinutesBefore: number | null;

  @Column({ type: 'timestamptz', nullable: true })
  cancelledAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
