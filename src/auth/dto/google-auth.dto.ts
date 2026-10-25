import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class GoogleAuthDto {
  @ApiProperty({
    example:
      'eyJhbGciOiJSUzI1NiIsImtpZCI6IjEyMzQ1Njc4OTAiLCJ0eXAiOiJKV1QifQ.eyJpc3MiOiJodHRwczovL2FjY291bnRzLmdvb2dsZS5jb20iLCJhenAiOiIxMjM0NTY3ODkwLmFwcHMuZ29vZ2xldXNlcmNvbnRlbnQuY29tIiwic3ViIjoiMTIzNDU2Nzg5MCIsImVtYWlsIjoiYWRhQGV4YW1wbGUuY29tIiwiZW1haWxfdmVyaWZpZWQiOnRydWUsImF1ZCI6IjEyMzQ1Njc4OTAuYXBwcy5nb29nbGV1c2VyY29udGVudC5jb20iLCJpYXQiOjE3MDAwMDAwMDAsImV4cCI6MTcwMDAwMzYwMH0.signature',
    description:
      'The Google ID token returned by the Google Sign-In SDK on the client.',
    maxLength: 8192,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(8192)
  idToken!: string;
}
