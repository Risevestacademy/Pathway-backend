import { CareerStatus, Prisma } from '../../generated/prisma/client';

export const readableCareerWhere = (
  userId: string,
): Prisma.CareerWhereInput => ({
  OR: [
    { status: CareerStatus.PUBLISHED },
    { status: CareerStatus.RETIRED, userPathways: { some: { userId } } },
  ],
});
