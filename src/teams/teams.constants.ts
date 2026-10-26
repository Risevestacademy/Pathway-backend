export const InviteStatus = {
  PENDING: 'PENDING',
  ACCEPTED: 'ACCEPTED',
  EXPIRED: 'EXPIRED',
  REVOKED: 'REVOKED',
} as const;

export type InviteStatus = (typeof InviteStatus)[keyof typeof InviteStatus];
