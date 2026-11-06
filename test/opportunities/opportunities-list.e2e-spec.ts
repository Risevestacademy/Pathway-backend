import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { apiPrefix as resolveApiPrefix, configureApp } from '../../src/common';
import { EnvironmentVariables } from '../../src/config';
import { PrismaService } from '../../src/prisma';
import {
  OpportunityType,
  OpportunityVerification,
} from '../../src/generated/prisma/client';
import { CatalogFixture, cleanupCatalog, seedCatalog } from '../utils/catalog';

interface ListItem {
  id: string;
  title: string;
  type: OpportunityType;
  organisation: string;
  location: string;
  status: string;
  deadline: string | null;
  summary: string;
}

const DAY = 24 * 60 * 60 * 1000;

describe('GET /opportunities (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let apiPrefix: string;
  let catalog: CatalogFixture;

  const timestamp = Date.now();
  const marker = `e2e-opps-${timestamp}`;
  const bulkMarker = `e2e-opps-bulk-${timestamp}`;
  const ids = {} as Record<
    'soon' | 'other' | 'open' | 'rolling' | 'closed' | 'draft' | 'withdrawn',
    string
  >;

  const list = (query: Record<string, string | number> = {}) =>
    request(app.getHttpServer()).get(`${apiPrefix}/opportunities`).query(query);

  const idsOf = (body: ListItem[]) => body.map((item) => item.id);

  const createOpportunity = async (
    key: keyof typeof ids,
    data: {
      type?: OpportunityType;
      verification?: OpportunityVerification;
      deadline?: Date | null;
      deadlineUnknown?: boolean;
      careerId: string;
    },
  ) => {
    const opportunity = await prisma.opportunity.create({
      data: {
        title: `${key} ${marker}`,
        type: data.type ?? OpportunityType.JOB,
        organisation: `Org ${marker}`,
        location: 'Remote',
        description: `Description for ${key}`,
        applyUrl: 'https://example.com/apply',
        verification: data.verification ?? OpportunityVerification.VERIFIED,
        deadline: data.deadline ?? null,
        deadlineUnknown: data.deadlineUnknown ?? false,
        careers: { create: { careerId: data.careerId } },
      },
    });
    ids[key] = opportunity.id;
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    apiPrefix = `/${resolveApiPrefix(
      app.get<ConfigService<EnvironmentVariables, true>>(ConfigService),
    )}`;
    prisma = app.get(PrismaService);
    await app.init();

    catalog = await seedCatalog(prisma, { suffix: marker });
    const careerA = catalog.publishedCareerId;
    const careerB = catalog.secondPublishedCareerId;
    const now = Date.now();

    await createOpportunity('soon', {
      deadline: new Date(now + 3 * DAY),
      careerId: careerA,
    });
    await createOpportunity('other', {
      type: OpportunityType.INTERNSHIP,
      deadline: new Date(now + 10 * DAY),
      careerId: careerB,
    });
    await createOpportunity('open', {
      type: OpportunityType.INTERNSHIP,
      deadline: new Date(now + 30 * DAY),
      careerId: careerA,
    });
    await createOpportunity('rolling', {
      type: OpportunityType.FELLOWSHIP,
      deadlineUnknown: true,
      careerId: careerA,
    });
    await createOpportunity('closed', {
      deadline: new Date(now - DAY),
      careerId: careerA,
    });
    await createOpportunity('draft', {
      verification: OpportunityVerification.DRAFT,
      deadline: new Date(now + 30 * DAY),
      careerId: careerA,
    });
    await createOpportunity('withdrawn', {
      verification: OpportunityVerification.WITHDRAWN,
      deadline: new Date(now + 30 * DAY),
      careerId: careerA,
    });

    await prisma.opportunity.createMany({
      data: Array.from({ length: 51 }, (_, i) => ({
        title: `${bulkMarker} ${i}`,
        type: OpportunityType.JOB,
        organisation: 'Bulk Org',
        location: 'Remote',
        description: 'd',
        applyUrl: 'https://example.com/apply',
        verification: OpportunityVerification.VERIFIED,
        deadlineUnknown: true,
      })),
    });
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.opportunity.deleteMany({
        where: {
          OR: [
            { title: { contains: marker } },
            { title: { contains: bulkMarker } },
          ],
        },
      });
      if (catalog) await cleanupCatalog(prisma, catalog);
    }
    await app?.close();
  });

  it('returns only visible listings, soonest deadline first and rolling last', async () => {
    const { body } = await list({ search: marker }).expect(200);
    const items = body as ListItem[];

    expect(idsOf(items)).toEqual([ids.soon, ids.other, ids.open, ids.rolling]);
    expect(items.map((item) => item.status)).toEqual([
      'CLOSING_SOON',
      'OPEN',
      'OPEN',
      'ROLLING',
    ]);
  });

  it('returns the list item shape', async () => {
    const { body } = await list({ search: marker }).expect(200);
    const rolling = (body as ListItem[]).find(
      (item) => item.id === ids.rolling,
    );

    expect(rolling).toEqual({
      id: ids.rolling,
      title: `rolling ${marker}`,
      type: OpportunityType.FELLOWSHIP,
      organisation: `Org ${marker}`,
      location: 'Remote',
      status: 'ROLLING',
      deadline: null,
      summary: 'Description for rolling',
    });
  });

  it('filters by type', async () => {
    const { body } = await list({
      search: marker,
      type: OpportunityType.INTERNSHIP,
    }).expect(200);

    expect(idsOf(body as ListItem[])).toEqual([ids.other, ids.open]);
  });

  it('filters by career', async () => {
    const { body } = await list({ careerId: catalog.publishedCareerId }).expect(
      200,
    );

    expect(idsOf(body as ListItem[])).toEqual([
      ids.soon,
      ids.open,
      ids.rolling,
    ]);
  });

  it('leaves out the excluded listing for "See similar roles"', async () => {
    const { body } = await list({
      careerId: catalog.publishedCareerId,
      excludeId: ids.soon,
    }).expect(200);

    expect(idsOf(body as ListItem[])).toEqual([ids.open, ids.rolling]);
  });

  it('searches the organisation ignoring case', async () => {
    const { body } = await list({
      search: `org ${marker}`.toUpperCase(),
    }).expect(200);

    expect(idsOf(body as ListItem[])).toEqual([
      ids.soon,
      ids.other,
      ids.open,
      ids.rolling,
    ]);
  });

  it('pages through the results', async () => {
    const { body } = await list({ search: marker, page: 2, limit: 2 }).expect(
      200,
    );

    expect(idsOf(body as ListItem[])).toEqual([ids.open, ids.rolling]);
  });

  it('caps a limit above the maximum', async () => {
    const { body } = await list({ search: bulkMarker, limit: 1000 }).expect(
      200,
    );

    expect(body).toHaveLength(50);
  });

  it('returns an empty array when nothing matches', async () => {
    const { body } = await list({ search: `${marker}-none` }).expect(200);

    expect(body).toEqual([]);
  });

  it('rejects an invalid type in the standard validation format', async () => {
    const { body } = await list({ type: 'GIG' }).expect(400);

    expect(body).toMatchObject({ statusCode: 400, error: 'VALIDATION_ERROR' });
    expect(body.fields).toHaveProperty('type');
  });

  it.each(['careerId', 'excludeId'])(
    'rejects a %s that is not a UUID',
    async (key) => {
      const { body } = await list({ [key]: 'abc' }).expect(400);

      expect(body).toMatchObject({ error: 'VALIDATION_ERROR' });
    },
  );
});
