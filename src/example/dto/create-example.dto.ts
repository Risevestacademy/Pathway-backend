import { IsNotEmpty, IsString } from 'class-validator';

// Rename this file to create-<resource>.dto.ts
// Replace fields with whatever the actual domain resource needs.
export class CreateExampleDto {
  @IsString()
  @IsNotEmpty()
  name: string;
}
