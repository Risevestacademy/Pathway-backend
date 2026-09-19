import { randomUUID } from 'node:crypto';

const REQUEST_ID_PATTERN = /^[a-zA-Z0-9._-]{1,128}$/;

export function generateRequestId(
  incomingId: string | string[] | undefined,
): string {
  if (typeof incomingId === 'string' && REQUEST_ID_PATTERN.test(incomingId)) {
    return incomingId;
  }

  return randomUUID();
}
