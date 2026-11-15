import { Transform, Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { isValidTimeZone } from '../analytics/analytics.service.js';

export class AdminLoginDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  username: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  password: string;
}

const tzTransform = ({ value }: { value: unknown }) =>
  typeof value === 'string' && isValidTimeZone(value) ? value : 'UTC';

export class AnalyticsQuery {
  @IsOptional()
  @Type(() => Number)
  @IsIn([7, 30, 90, 365])
  days?: number;

  /** IANA time zone used to bucket days (e.g. "Asia/Karachi"). Invalid → UTC. */
  @IsOptional()
  @Transform(tzTransform)
  @IsString()
  tz?: string;
}

export class AdminUsersQuery {
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MaxLength(100)
  search?: string;

  @IsOptional()
  @IsIn([
    'createdAt',
    'lastActiveAt',
    'journalEntries',
    'savedSessions',
    'checkIns',
  ])
  sort?:
    | 'createdAt'
    | 'lastActiveAt'
    | 'journalEntries'
    | 'savedSessions'
    | 'checkIns';

  @IsOptional()
  @IsIn(['asc', 'desc'])
  order?: 'asc' | 'desc';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}
