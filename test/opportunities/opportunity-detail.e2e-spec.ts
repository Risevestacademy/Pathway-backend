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

const DAY = 24 * 60 * 60 * 1000;

describe('GET /opportunities/:id (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let apiPrefix: string;
  let catalog: CatalogFixture;
  let skillId: string;

  const timestamp = Date.now();
  const marker = `e2e-opp-detail-${timestamp}`;
  const unknownId = '00000000-0000-4000-8000-000000000000';
  const ids = {} as Record<
    'visible' | 'closed' | 'rolling' | 'draft' | 'withdrawn',
    string
  >;

  const detail = (id: string) =>
    request(app.getHttpServer()).get(`${apiPrefix}/opportunities/${id}`);

  const createOpportunity = async (
    key: keyof typeof ids,
    data: {
      verification?: OpportunityVerification;
      deadline?: Date | null;
      deadlineUnknown?: boolean;
    },
  ) => {
    const opportunity = await prisma.opportunity.create({
      data: {
        title: `${key} ${marker}`,
        type: OpportunityType.INTERNSHIP,
        organisation: `Org ${marker}`,
        location: 'Remote',
        description: `Description for ${key}`,
        responsibilities: ['Write endpoints'],
        audience: ['Students'],
        pay: '150k a month',
        duration: '3 months',
        startDate: new Date(Date.UTC(2026, 11, 1)),
        applyUrl: 'https://example.com/apply',
        verification: data.verification ?? OpportunityVerification.VERIFIED,
        deadline: data.deadline ?? null,
        deadlineUnknown: data.deadlineUnknown ?? false,
        careers: { create: { careerId: catalog.publishedCareerId } },
        skills: { create: { skillId } },
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
    await app.listen(0, '127.0.0.1');

    catalog = await seedCatalog(prisma, { suffix: marker });
    skillId = (await prisma.skill.create({ data: { name: `${marker} skill` } }))
      .id;

    const now = Date.now();
    await createOpportunity('visible', { deadline: new Date(now + 30 * DAY) });
    await createOpportunity('closed', { deadline: new Date(now - DAY) });
    await createOpportunity('rolling', { deadlineUnknown: true });
    await createOpportunity('draft', {
      verification: OpportunityVerification.DRAFT,
      deadline: new Date(now + 30 * DAY),
    });
    await createOpportunity('withdrawn', {
      verification: OpportunityVerification.WITHDRAWN,
      deadline: new Date(now + 30 * DAY),
    });
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.opportunity.deleteMany({
        where: { title: { contains: marker } },
      });
      if (skillId) await prisma.skill.deleteMany({ where: { id: skillId } });
      if (catalog) await cleanupCatalog(prisma, catalog);
    }
    await app?.close();
  });

  it('returns a visible listing with every detail field and no auth', async () => {
    const { body } = await detail(ids.visible).expect(200);

    expect(body).toEqual({
      id: ids.visible,
      title: `visible ${marker}`,
      type: OpportunityType.INTERNSHIP,
      organisation: `Org ${marker}`,
      location: 'Remote',
      description: 'Description for visible',
      status: 'OPEN',
      responsibilities: ['Write endpoints'],
      audience: ['Students'],
      pay: '150k a month',
      duration: '3 months',
      startDate: '2026-12-01T00:00:00.000Z',
      applyUrl: 'https://example.com/apply',
      deadline: expect.any(String),
      careers: [{ id: catalog.publishedCareerId, title: expect.any(String) }],
      skills: [{ id: skillId, name: `${marker} skill` }],
    });
  });

  it('returns a closed listing with 200 and the CLOSED status', async () => {
    const { body } = await detail(ids.closed).expect(200);

    expect(body).toMatchObject({ id: ids.closed, status: 'CLOSED' });
  });

  it('returns a rolling listing with a null deadline', async () => {
    const { body } = await detail(ids.rolling).expect(200);

    expect(body).toMatchObject({
      id: ids.rolling,
      status: 'ROLLING',
      deadline: null,
    });
  });

  it('never includes verifiedById or other review fields', async () => {
    const { body } = await detail(ids.visible).expect(200);

    for (const key of [
      'verifiedById',
      'verifiedAt',
      'lastCheckedAt',
      'verification',
      'deadlineUnknown',
    ]) {
      expect(body).not.toHaveProperty(key);
    }
  });

  it.each<[string, () => string]>([
    ['draft', () => ids.draft],
    ['withdrawn', () => ids.withdrawn],
    ['unknown', () => unknownId],
  ])('returns 404 for a %s listing', async (_label, id) => {
    const { body } = await detail(id()).expect(404);

    expect(body).toMatchObject({
      statusCode: 404,
      error: 'NOT_FOUND',
      message: 'Opportunity not found',
    });
  });

  it('returns 400 for a malformed id', async () => {
    await detail('not-a-uuid').expect(400);
  });
});
