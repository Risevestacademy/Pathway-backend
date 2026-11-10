import {
  OpportunityType,
  OpportunityVerification,
  PrismaClient,
} from '../src/generated/prisma/client';

/**
 * Demo opportunities.
 *
 * These are made-up listings: the organisations are fictional and the apply URLs
 * are example.com placeholders. They exist so the Opportunities screens have
 * something to show on dev/staging, so they are skipped when NODE_ENV=production.
 * Real listings should be added through the admin area, with a real source.
 *
 * Create-only, like the catalog: an opportunity that already exists is left alone,
 * so admin edits survive re-seeding. SEED_REFRESH_CATALOG=true overwrites them.
 * Run this after seedCatalog, because it links to careers and skills by slug/name.
 */
const REFRESH = process.env.SEED_REFRESH_CATALOG === 'true';

const CHECKED_AT = new Date('2026-11-10T00:00:00.000Z');

interface OpportunitySeed {
  id: string;
  title: string;
  type: OpportunityType;
  organisation: string;
  location: string;
  description: string;
  responsibilities: string[];
  audience: string[];
  pay?: string;
  duration?: string;
  startDate?: Date;
  applyUrl: string;
  deadline?: Date;
  deadlineUnknown?: boolean;
  careers: string[]; // career slugs
  skills: string[]; // skill names
}

const OPPORTUNITIES: OpportunitySeed[] = [
  {
    id: '90f95193-2c91-4a42-a506-930d4c964c45',
    title: 'Frontend Engineering Intern',
    type: OpportunityType.INTERNSHIP,
    organisation: 'Example Tech Ltd',
    location: 'Lagos, Nigeria (hybrid)',
    description:
      'A three-month internship building user interfaces with a small product team.',
    responsibilities: [
      'Build and test React components from design files',
      'Connect screens to REST APIs',
      'Review pull requests with a mentor',
    ],
    audience: ['Students', 'Recent graduates'],
    pay: 'Monthly stipend',
    duration: '3 months',
    startDate: new Date('2027-03-01T00:00:00.000Z'),
    applyUrl: 'https://example.com/opportunities/frontend-engineering-intern',
    deadline: new Date('2027-01-31T00:00:00.000Z'),
    careers: ['frontend-engineer'],
    skills: ['React', 'TypeScript', 'Git'],
  },
  {
    id: '78a2d30d-b964-4965-b7c1-cadcd6c6c5c0',
    title: 'Junior Backend Engineer',
    type: OpportunityType.JOB,
    organisation: 'Sample Systems Ltd',
    location: 'Remote (Nigeria)',
    description:
      'A full-time role maintaining and extending APIs for a growing platform.',
    responsibilities: [
      'Build and maintain REST APIs with NestJS',
      'Design and query PostgreSQL databases',
      'Write automated tests and fix production bugs',
    ],
    audience: ['Recent graduates', 'Early-career professionals'],
    pay: 'Salaried',
    startDate: new Date('2027-04-01T00:00:00.000Z'),
    applyUrl: 'https://example.com/opportunities/junior-backend-engineer',
    deadline: new Date('2027-02-15T00:00:00.000Z'),
    careers: ['backend-engineer'],
    skills: ['TypeScript', 'NestJS', 'Prisma'],
  },
  {
    id: '51b3b775-5f85-4016-a946-4de6ba35c042',
    title: 'Data Analytics Fellowship',
    type: OpportunityType.FELLOWSHIP,
    organisation: 'Demo Analytics Hub',
    location: 'Abuja, Nigeria (in person)',
    description:
      'A six-month fellowship with mentoring, working on real datasets for partner organisations.',
    responsibilities: [
      'Clean and analyse partner datasets with SQL and spreadsheets',
      'Build dashboards and present findings to stakeholders',
      'Join weekly mentoring and review sessions',
    ],
    audience: ['Students', 'Recent graduates'],
    pay: 'Monthly allowance',
    duration: '6 months',
    startDate: new Date('2027-03-15T00:00:00.000Z'),
    applyUrl: 'https://example.com/opportunities/data-analytics-fellowship',
    deadline: new Date('2027-02-28T00:00:00.000Z'),
    careers: ['data-analyst'],
    skills: ['SQL', 'Excel', 'Data Visualization'],
  },
  {
    id: 'f7b7474c-53c3-4579-8f46-42982e159731',
    title: 'Mobile App Weekend Hackathon',
    type: OpportunityType.HACKATHON,
    organisation: 'Sample Mobile Guild',
    location: 'Online',
    description:
      'A 48-hour online hackathon to build and demo a mobile app with a small team.',
    responsibilities: [
      'Form a team and pick a problem to solve',
      'Build a working React Native prototype',
      'Present a short demo to the judges',
    ],
    audience: ['Students', 'Recent graduates', 'Early-career professionals'],
    duration: '48 hours',
    applyUrl: 'https://example.com/opportunities/mobile-app-weekend-hackathon',
    deadlineUnknown: true, // dates not announced yet
    careers: ['mobile-engineer'],
    skills: ['React Native', 'TypeScript'],
  },
];

function lookup(ids: Map<string, string>, key: string, kind: string): string {
  const id = ids.get(key);

  if (!id) {
    throw new Error(`Opportunity seed references unknown ${kind} "${key}"`);
  }

  return id;
}

export async function seedOpportunities(prisma: PrismaClient): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    console.log('Skipping demo opportunities in production');
    return;
  }

  const careerIds = new Map(
    (await prisma.career.findMany({ select: { id: true, slug: true } })).map(
      ({ id, slug }) => [slug, id],
    ),
  );
  const skillIds = new Map(
    (await prisma.skill.findMany({ select: { id: true, name: true } })).map(
      ({ id, name }) => [name, id],
    ),
  );

  for (const { id, careers, skills, ...opportunity } of OPPORTUNITIES) {
    if (!REFRESH) {
      const existing = await prisma.opportunity.findUnique({
        where: { id },
        select: { id: true },
      });

      if (existing) {
        continue;
      }
    }

    const data = {
      ...opportunity,
      verification: OpportunityVerification.VERIFIED,
      verifiedAt: CHECKED_AT,
      lastCheckedAt: CHECKED_AT,
    };

    await prisma.opportunity.upsert({
      where: { id },
      update: data,
      create: { id, ...data },
    });

    await prisma.opportunityCareer.deleteMany({
      where: { opportunityId: id },
    });
    await prisma.opportunityCareer.createMany({
      data: careers.map((slug) => ({
        opportunityId: id,
        careerId: lookup(careerIds, slug, 'career'),
      })),
    });

    await prisma.opportunitySkill.deleteMany({
      where: { opportunityId: id },
    });
    await prisma.opportunitySkill.createMany({
      data: skills.map((name) => ({
        opportunityId: id,
        skillId: lookup(skillIds, name, 'skill'),
      })),
    });
  }
}
