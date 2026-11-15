import {
  OpportunityVerification,
  type Prisma,
} from '../generated/prisma/client';
import type { GetOpportunitiesQueryDto } from './dto/get-opportunities-query.dto';
import type {
  OpportunityListItemDto,
  SavedOpportunityListItemDto,
} from './dto/opportunity-list-item.dto';
import { deriveStatus } from './opportunities.rules';

export const SUMMARY_MAX_LENGTH = 160;

// Same condition as isVisible, run in the database
export type OpportunityListFilter = Pick<
  GetOpportunitiesQueryDto,
  'type' | 'careerId' | 'excludeId' | 'search' | 'saved'
> & {
  userId?: string;
};

export const buildOpportunityListWhere = (
  query: OpportunityListFilter,
  now: Date,
): Prisma.OpportunityWhereInput => {
  const and: Prisma.OpportunityWhereInput[] = [
    { OR: [{ deadlineUnknown: true }, { deadline: { gt: now } }] },
  ];

  if (query.search)
    and.push({
      OR: [
        { title: { contains: query.search, mode: 'insensitive' } },
        { organisation: { contains: query.search, mode: 'insensitive' } },
      ],
    });

  return {
    verification: OpportunityVerification.VERIFIED,
    AND: and,
    ...(query.type && { type: query.type }),
    ...(query.careerId && { careers: { some: { careerId: query.careerId } } }),
    ...(query.excludeId && { id: { not: query.excludeId } }),
    ...(query.saved &&
      query.userId && {
        saves: { some: { userId: query.userId } },
      }),
  };
};

// Soonest deadline first, rolling last, id for a stable page order
export const OPPORTUNITY_LIST_ORDER_BY: Prisma.OpportunityOrderByWithRelationInput[] =
  [
    { deadlineUnknown: 'asc' },
    { deadline: { sort: 'asc', nulls: 'last' } },
    { id: 'asc' },
  ];

export const OPPORTUNITY_LIST_SELECT = {
  id: true,
  title: true,
  type: true,
  organisation: true,
  location: true,
  description: true,
  verification: true,
  deadline: true,
  deadlineUnknown: true,
} satisfies Prisma.OpportunitySelect;

export type OpportunityListRow = Prisma.OpportunityGetPayload<{
  select: typeof OPPORTUNITY_LIST_SELECT;
}>;

const WITH_SAVES_SELECT = {
  ...OPPORTUNITY_LIST_SELECT,
  saves: { select: { userId: true } },
} satisfies Prisma.OpportunitySelect;

export type OpportunityListWithSavesRow = Prisma.OpportunityGetPayload<{
  select: typeof WITH_SAVES_SELECT;
}>;

/**
 * Two select shapes: the anonymous shape (no save data) and the signed-in
 * shape, which carries a filtered `saves` relation so the mapper can set
 * `isSaved` without a second query.
 */
export const buildOpportunityListSelect = (userId?: string) => {
  if (!userId) return OPPORTUNITY_LIST_SELECT;

  return {
    ...OPPORTUNITY_LIST_SELECT,
    saves: { where: { userId }, select: { userId: true } },
  } satisfies Prisma.OpportunitySelect;
};

export const toSummary = (description: string): string => {
  const text = description.trim();
  if (text.length <= SUMMARY_MAX_LENGTH) return text;

  const cut = text.slice(0, SUMMARY_MAX_LENGTH);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > 0 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
};

export const toOpportunityListItem = (
  row: OpportunityListRow,
  now: Date,
): OpportunityListItemDto => ({
  id: row.id,
  title: row.title,
  type: row.type,
  organisation: row.organisation,
  location: row.location,
  status: deriveStatus(row, now),
  deadline: row.deadline,
  summary: toSummary(row.description),
});

export const toOpportunityListItemWithSave = (
  row: OpportunityListWithSavesRow,
  now: Date,
): SavedOpportunityListItemDto => ({
  ...toOpportunityListItem(row, now),
  isSaved: row.saves.length > 0,
});
