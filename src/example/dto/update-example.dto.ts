import { PartialType } from '@nestjs/mapped-types';
import { CreateExampleDto } from './create-example.dto';

// Rename this file to update-<resource>.dto.ts
// PartialType makes every field from CreateDto optional — standard pattern
// for update DTOs, don't hand-redeclare the fields.
export class UpdateExampleDto extends PartialType(CreateExampleDto) {}
