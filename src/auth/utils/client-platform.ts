import { BadRequestException } from '@nestjs/common';
import { type ApiHeaderOptions } from '@nestjs/swagger';
import { type Request } from 'express';

export const CLIENT_PLATFORM_HEADER = 'X-Client-Platform';

export const CLIENT_PLATFORM_API_HEADER: ApiHeaderOptions = {
  name: CLIENT_PLATFORM_HEADER,
  required: false,
  description:
    "'mobile' carries the refresh token in the request body; 'web' or an absent header carries it in the HttpOnly cookie. Any other value is rejected with 400.",
  schema: { type: 'string', enum: ['web', 'mobile'] },
};

export type ClientPlatform = 'web' | 'mobile';

export function resolveClientPlatform(request: Request): ClientPlatform {
  const value = request.get(CLIENT_PLATFORM_HEADER)?.trim();

  if (!value) {
    return 'web';
  }

  const normalized = value.toLowerCase();

  if (normalized === 'web' || normalized === 'mobile') {
    return normalized;
  }

  throw new BadRequestException(
    `${CLIENT_PLATFORM_HEADER} must be either 'web' or 'mobile'`,
  );
}
