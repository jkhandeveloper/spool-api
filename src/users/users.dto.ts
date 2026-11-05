import {
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import type { TextSize } from './user.entity.js';

export class UpdateMeDto {
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(80)
  displayName?: string | null;

  @IsOptional()
  @IsBoolean()
  remindersEnabled?: boolean;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, {
    message: 'reminderTime must be HH:mm',
  })
  reminderTime?: string | null;

  @IsOptional()
  @IsIn(['default', 'large', 'extra-large'])
  textSize?: TextSize;

  @IsOptional()
  @IsBoolean()
  reduceMotion?: boolean;

  @IsOptional()
  @IsBoolean()
  journalOnly?: boolean;
}

export class PrivacyReviewDto {
  /** true when the user picked "Use journals without recording". */
  @IsBoolean()
  journalOnly: boolean;
}

export class DeleteAccountDto {
  @IsString()
  @IsNotEmpty()
  password: string;
}
