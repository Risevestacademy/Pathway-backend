import type { Prisma } from '../../generated/prisma/client';
import type { CareerListItemDto } from './dto/list-careers.dto';

export const careerListItemSelect = {
  id: true,
  slug: true,
  title: true,
  description: true,
} satisfies Prisma.CareerSelect;

export type CareerListItemRow = Prisma.CareerGetPayload<{
  select: typeof careerListItemSelect;
}>;

export const toCareerListItem = (
  career: CareerListItemRow,
): CareerListItemDto => ({
  id: career.id,
  slug: career.slug,
  title: career.title,
  shortDescription: career.description,
});
