import {
  OpportunityVerification,
  type Prisma,
} from '../generated/prisma/client';
import type { OpportunityDetailDto } from './dto/opportunity-detail.dto';
import { deriveStatus } from './opportunities.rules';

// Only verified listings have a detail page. A closed one is still verified,
// so it is returned and deriveStatus labels it CLOSED. Drafts and withdrawn
// listings are filtered out here, so deriveStatus never sees them.
export const buildOpportunityDetailWhere = (
  id: string,
): Prisma.OpportunityWhereInput => ({
  id,
  verification: OpportunityVerification.VERIFIED,
});

// verifiedById and the other review fields are deliberately not selected
export const OPPORTUNITY_DETAIL_SELECT = {
  id: true,
  title: true,
  type: true,
  organisation: true,
  location: true,
  description: true,
  responsibilities: true,
  audience: true,
  pay: true,
  duration: true,
  startDate: true,
  applyUrl: true,
  deadline: true,
  deadlineUnknown: true,
  verification: true,
  careers: {
    select: { career: { select: { id: true, title: true } } },
    orderBy: { career: { title: 'asc' } },
  },
  skills: {
    select: { skill: { select: { id: true, name: true } } },
    orderBy: { skill: { name: 'asc' } },
  },
} satisfies Prisma.OpportunitySelect;

export type OpportunityDetailRow = Prisma.OpportunityGetPayload<{
  select: typeof OPPORTUNITY_DETAIL_SELECT;
}>;

export const toOpportunityDetail = (
  row: OpportunityDetailRow,
  now: Date,
): OpportunityDetailDto => ({
  id: row.id,
  title: row.title,
  type: row.type,
  organisation: row.organisation,
  location: row.location,
  description: row.description,
  status: deriveStatus(row, now),
  responsibilities: row.responsibilities,
  audience: row.audience,
  pay: row.pay,
  duration: row.duration,
  startDate: row.startDate,
  applyUrl: row.applyUrl,
  deadline: row.deadline,
  careers: row.careers.map(({ career }) => career),
  skills: row.skills.map(({ skill }) => skill),
});
