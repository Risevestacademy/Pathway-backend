import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  ValidateIf,
  type ValidationArguments,
} from 'class-validator';

const isSentOrBodyEmpty = (
  dto: UpdateNotificationPreferenceDto,
  value: unknown,
) =>
  value !== undefined ||
  (dto.inAppEnabled === undefined && dto.emailEnabled === undefined);

const message = ({ value, property }: ValidationArguments) =>
  value === undefined
    ? 'at least one of inAppEnabled and emailEnabled is required'
    : `${property} must be a boolean value`;

export class UpdateNotificationPreferenceDto {
  @ApiPropertyOptional({
    example: true,
    description: 'Required when emailEnabled is omitted. Cannot be null.',
  })
  @ValidateIf(isSentOrBodyEmpty)
  @IsBoolean({ message })
  inAppEnabled?: boolean;

  @ApiPropertyOptional({
    example: false,
    description: 'Required when inAppEnabled is omitted. Cannot be null.',
  })
  @ValidateIf(isSentOrBodyEmpty)
  @IsBoolean({ message })
  emailEnabled?: boolean;
}
