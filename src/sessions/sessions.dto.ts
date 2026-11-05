import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  Equals,
  IsArray,
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
const trimAll = ({ value }: { value: unknown }) =>
  Array.isArray(value)
    ? value.map((v) => (typeof v === 'string' ? v.trim() : v))
    : value;

export class CreateSessionDto {
  /** The consent script was read aloud and everyone present agreed. */
  @Equals(true, {
    message: 'Everyone present must agree before recording starts',
  })
  consentConfirmed: boolean;

  @IsOptional()
  @Transform(trimAll)
  @IsArray()
  @ArrayMaxSize(5)
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  @MaxLength(200, { each: true })
  prompts?: string[];
}

export class SubmitTranscriptDto {
  @Transform(trim)
  @IsString()
  @MaxLength(200_000)
  transcript: string;

  @IsInt()
  @Min(0)
  @Max(6 * 60 * 60)
  durationSeconds: number;
}

export class UpdateSessionDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  title?: string;

  @IsOptional()
  @Transform(trimAll)
  @IsArray()
  @ArrayMaxSize(3)
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  topics?: string[];

  @IsOptional()
  @Transform(trimAll)
  @IsArray()
  @ArrayMaxSize(6)
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  @MaxLength(400, { each: true })
  mainPoints?: string[];

  @IsOptional()
  @Transform(trimAll)
  @IsArray()
  @ArrayMaxSize(6)
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  @MaxLength(400, { each: true })
  takeaways?: string[];

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(280)
  dailyGoal?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(280)
  weeklyGoal?: string;
}

export class SaveSessionDto {
  /** "Keep this summary": false saves the goals but not the summary itself. */
  @IsBoolean()
  keep: boolean;
}
