import {
  UI_MOTIONS,
  UI_SCALES,
  UI_THEMES,
  type UiMotion,
  type UiScale,
  type UiTheme,
} from '@agregator/shared';
import { IsIn, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdatePreferencesDto {
  @IsOptional()
  @IsIn(UI_THEMES)
  @ApiPropertyOptional({ enum: UI_THEMES, enumName: 'UiTheme' })
  theme?: UiTheme;

  @IsOptional()
  @IsIn(UI_SCALES)
  @ApiPropertyOptional({ enum: UI_SCALES, enumName: 'UiScale' })
  scale?: UiScale;

  @IsOptional()
  @IsIn(UI_MOTIONS)
  @ApiPropertyOptional({ enum: UI_MOTIONS, enumName: 'UiMotion' })
  motion?: UiMotion;
}
