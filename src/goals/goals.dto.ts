import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class UpdateGoalDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(280)
  text?: string;

  @IsOptional()
  @IsBoolean()
  completed?: boolean;
}

export class CreateGoalDto {
  @IsIn(['daily', 'weekly'])
  cadence: 'daily' | 'weekly';

  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(280)
  text: string;
}

export class CreateCheckInDto {
  @IsBoolean()
  completed: boolean;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(5_000)
  reflection?: string;
}
