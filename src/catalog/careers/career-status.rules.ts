import { CareerStatus } from '../../generated/prisma/client';

/** Only a live (PUBLISHED) career can be retired. */
export const canRetire = (status: CareerStatus): boolean =>
  status === CareerStatus.PUBLISHED;
