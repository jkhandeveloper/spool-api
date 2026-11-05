import { Exclude } from 'class-transformer';
import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type TextSize = 'default' | 'large' | 'extra-large';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 320, unique: true })
  email: string;

  @Exclude()
  @Column({ type: 'varchar', length: 100, select: false })
  passwordHash: string;

  @Column({ type: 'varchar', length: 80, nullable: true })
  displayName: string | null;

  /** Journal-only mode: session recording is disabled for this account. */
  @Column({ type: 'boolean', default: false })
  journalOnly: boolean;

  @Column({ type: 'timestamptz', nullable: true })
  privacyReviewedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  graduatedAt: Date | null;

  @Column({ type: 'boolean', default: true })
  remindersEnabled: boolean;

  /** Local time of day for the daily reminder, "HH:mm". */
  @Column({ type: 'varchar', length: 5, nullable: true, default: '20:00' })
  reminderTime: string | null;

  @Column({ type: 'varchar', length: 16, default: 'default' })
  textSize: TextSize;

  @Column({ type: 'boolean', default: false })
  reduceMotion: boolean;

  /** Incremented to revoke every refresh token issued so far. */
  @Exclude()
  @Column({ type: 'int', default: 0, select: false })
  tokenVersion: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
