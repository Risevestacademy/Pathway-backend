import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class GoogleAuthDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(8192)
  idToken!: string;
}
