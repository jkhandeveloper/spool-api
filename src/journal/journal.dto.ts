import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CreateJournalEntryDto {
  /** Optional: derived from the first line of the body when omitted. */
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(120)
  title?: string;

  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(20_000)
  body: string;

  @IsOptional()
  @IsBoolean()
  includeInPrompts?: boolean;
}

export class UpdateJournalEntryDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  title?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(20_000)
  body?: string;

  @IsOptional()
  @IsBoolean()
  includeInPrompts?: boolean;
}

export class ListJournalQuery {
  @IsOptional()
  @Transform(({ value }) => parseInt(value as string, 10))
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @Transform(({ value }) => parseInt(value as string, 10))
  @IsInt()
  @Min(0)
  offset?: number;
}
