import { Transform, Type } from 'class-transformer';
import {
  IsDate,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import type { AppointmentKind } from './appointment.entity.js';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
const KINDS: AppointmentKind[] = ['in_person', 'video', 'phone'];

export class CreateAppointmentDto {
  @Type(() => Date)
  @IsDate()
  startsAt: Date;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  title?: string;

  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(480)
  durationMinutes?: number;

  @IsOptional()
  @IsIn(KINDS)
  kind?: AppointmentKind;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @Transform(trim)
  @IsString()
  @MaxLength(200)
  location?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(5_000)
  notes?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsInt()
  @Min(0)
  @Max(10_080)
  reminderMinutesBefore?: number | null;
}

export class UpdateAppointmentDto {
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  startsAt?: Date;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  title?: string;

  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(480)
  durationMinutes?: number;

  @IsOptional()
  @IsIn(KINDS)
  kind?: AppointmentKind;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @Transform(trim)
  @IsString()
  @MaxLength(200)
  location?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(5_000)
  notes?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsInt()
  @Min(0)
  @Max(10_080)
  reminderMinutesBefore?: number | null;
}

export class ListAppointmentsQuery {
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  from?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  to?: Date;
}
