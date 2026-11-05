import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
  type Relation,
} from 'typeorm';
import { Goal } from './goal.entity.js';

@Entity('goal_check_ins')
export class GoalCheckIn {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Goal, (g) => g.checkIns, { onDelete: 'CASCADE' })
  goal: Relation<Goal>;

  @Column({ type: 'uuid' })
  goalId: string;

  @Column({ type: 'boolean', default: false })
  completed: boolean;

  @Column({ type: 'text', nullable: true })
  reflection: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
