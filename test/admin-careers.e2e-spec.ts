import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { apiPrefix as resolveApiPrefix, configureApp } from '../src/common';
import { EnvironmentVariables } from '../src/config';
import { NotificationService } from '../src/notifications';
import { PrismaService } from '../src/prisma';
import { CareerStatus, Role } from '../src/generated/prisma/client';
import {
  notificationMock,
  registerAndVerify,
  wireNotificationMock,
} from './utils/auth';

describe('Admin careers read (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let apiPrefix: string;

  const userIds: string[] = [];
  const tokens = {} as Record<Role, string>;
  const careerIds = {} as Record<'draft' | 'published' | 'retired', string>;
  let editorId: string;
  let fieldId: string;
  let skillId: string;
  let sourceId: string;
  const resourceIds: string[] = [];

  const password = 'Password123!';
  const timestamp = Date.now();
  const marker = `e2e-admin-careers-${timestamp}`;
  const SNAPSHOT_MARKER = `SNAPSHOT-${timestamp}`;

  const list = (
    query: Record<string, string | number>,
    token = tokens[Role.EDITOR],
  ) =>
    request(app.getHttpServer())
      .get(`${apiPrefix}/admin/careers`)
      .query(query)
      .set('Authorization', `Bearer ${token}`);

  const detail = (id: string, token = tokens[Role.EDITOR]) =>
    request(app.getHttpServer())
      .get(`${apiPrefix}/admin/careers/${id}`)
      .set('Authorization', `Bearer ${token}`);

  const createCareer = (
    key: 'draft' | 'published' | 'retired',
    status: CareerStatus,
    updatedAt: Date,
  ) =>
    prisma.career.create({
      data: {
        slug: `${marker}-${key}`,
        title: `${marker} ${key}`,
        description: 'd',
        roleSummary: 'r',
        exampleActivities: [],
        fieldId,
        status,
        updatedAt,
      },
    });

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(NotificationService)
      .useValue(notificationMock)
      .compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    apiPrefix = `/${resolveApiPrefix(
      app.get<ConfigService<EnvironmentVariables, true>>(ConfigService),
    )}`;
    prisma = app.get(PrismaService);
    await app.init();

    wireNotificationMock();

    for (const role of [Role.USER, Role.EDITOR, Role.ADMIN]) {
      const email = `${marker}-${role.toLowerCase()}@test.com`;
      const registered = await registerAndVerify(app, apiPrefix, {
        email,
        password,
      });
      userIds.push(registered.id);
      if (role === Role.EDITOR) editorId = registered.id;
      await prisma.user.update({
        where: { id: registered.id },
        data: { role },
      });
      const login = await request(app.getHttpServer())
        .post(`${apiPrefix}/auth/login`)
        .send({ email, password })
        .expect(200);
      tokens[role] = (login.body as { accessToken: string }).accessToken;
    }

    fieldId = (
      await prisma.field.create({
        data: {
          name: `Admin Careers Field ${timestamp}`,
          slug: `${marker}-field`,
        },
      })
    ).id;
    skillId = (await prisma.skill.create({ data: { name: `${marker} skill` } }))
      .id;
    sourceId = (
      await prisma.source.create({
        data: { name: `${marker} source`, url: 'https://example.com' },
      })
    ).id;

    for (const [label, status] of [
      ['active', 'ACTIVE'],
      ['withdrawn', 'WITHDRAWN'],
    ] as const) {
      const resource = await prisma.resource.create({
        data: {
          title: `${marker} ${label}`,
          url: `https://example.com/${label}`,
          type: 'ARTICLE',
          provider: 'Example',
          curationRationale: 'r',
          lastCheckedDate: new Date(),
          status,
        },
      });
      resourceIds.push(resource.id);
    }

    const draft = await prisma.career.create({
      data: {
        slug: `${marker}-draft`,
        title: `${marker} draft`,
        description: 'd',
        roleSummary: 'r',
        exampleActivities: [],
        fieldId,
        status: CareerStatus.DRAFT,
        updatedAt: new Date(Date.UTC(2026, 9, 22)),
        skills: {
          create: [
            { skill: { connect: { id: skillId } }, importance: 'REQUIRED' },
          ],
        },
        outlook: {
          create: [
            {
              type: 'SALARY',
              geography: 'United States',
              period: '2026',
              median: '95000.00',
              currency: 'USD',
              source: { connect: { id: sourceId } },
            },
          ],
        },
        pathway: {
          create: {
            title: 'Pathway',
            steps: {
              create: [
                {
                  title: 'Step 1',
                  learningObjective: 'lo',
                  expectedActivity: 'ea',
                  order: 1,
                  skills: { create: [{ skill: { connect: { id: skillId } } }] },
                  resources: {
                    create: resourceIds.map((id) => ({
                      resource: { connect: { id } },
                    })),
                  },
                },
              ],
            },
          },
        },
      },
    });
    careerIds.draft = draft.id;
    careerIds.published = (
      await createCareer(
        'published',
        CareerStatus.PUBLISHED,
        new Date(Date.UTC(2026, 9, 21)),
      )
    ).id;
    careerIds.retired = (
      await createCareer(
        'retired',
        CareerStatus.RETIRED,
        new Date(Date.UTC(2026, 9, 20)),
      )
    ).id;

    await prisma.contentRevision.create({
      data: {
        careerId: careerIds.draft,
        baseVersion: 1,
        snapshot: { leak: SNAPSHOT_MARKER },
        createdById: editorId,
      },
    });
  });

  afterAll(async () => {
    await prisma.career.deleteMany({
      where: { id: { in: Object.values(careerIds) } },
    });
    await prisma.resource.deleteMany({ where: { id: { in: resourceIds } } });
    await prisma.skill.deleteMany({ where: { id: skillId } });
    await prisma.source.deleteMany({ where: { id: sourceId } });
    await prisma.field.deleteMany({ where: { id: fieldId } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await app.close();
  });

  describe('authorization', () => {
    it('returns 401 without an access token', async () => {
      await request(app.getHttpServer())
        .get(`${apiPrefix}/admin/careers`)
        .expect(401);
      await request(app.getHttpServer())
        .get(`${apiPrefix}/admin/careers/${careerIds.draft}`)
        .expect(401);
    });

    it('returns 403 to a USER on both routes', async () => {
      const listResponse = await list({}, tokens[Role.USER]).expect(403);
      await detail(careerIds.draft, tokens[Role.USER]).expect(403);

      expect(listResponse.body.error).toBe('FORBIDDEN');
    });

    it('lets an ADMIN through, since the minimum is EDITOR', async () => {
      await list({ search: marker }, tokens[Role.ADMIN]).expect(200);
    });
  });

  describe('GET /admin/careers', () => {
    it('lists careers in every status, most recently updated first', async () => {
      const response = await list({ search: marker }).expect(200);

      expect(response.body).toMatchObject({ total: 3, page: 1, limit: 20 });
      expect(
        (response.body.items as { id: string }[]).map((item) => item.id),
      ).toEqual([careerIds.draft, careerIds.published, careerIds.retired]);
    });

    it('returns list fields only', async () => {
      const response = await list({ search: marker }).expect(200);
      const [item] = response.body.items as Record<string, unknown>[];

      expect(Object.keys(item).sort()).toEqual([
        'field',
        'id',
        'slug',
        'status',
        'title',
        'updatedAt',
        'version',
      ]);
    });

    it('filters by status, so drafts are included', async () => {
      const response = await list({ search: marker, status: 'DRAFT' }).expect(
        200,
      );

      expect(response.body.total).toBe(1);
      expect(response.body.items[0].id).toBe(careerIds.draft);
    });

    it('searches the title case-insensitively', async () => {
      const response = await list({ search: marker.toUpperCase() }).expect(200);

      expect(response.body.total).toBe(3);
    });

    it('searches the slug case-insensitively', async () => {
      const response = await list({
        search: `${marker}-PUBLISHED`.toUpperCase(),
      }).expect(200);

      expect(response.body.total).toBe(1);
      expect(response.body.items[0].id).toBe(careerIds.published);
    });

    it('paginates with page and limit', async () => {
      const response = await list({ search: marker, page: 2, limit: 2 }).expect(
        200,
      );

      expect(response.body).toMatchObject({ total: 3, page: 2, limit: 2 });
      expect(
        (response.body.items as { id: string }[]).map((item) => item.id),
      ).toEqual([careerIds.retired]);
    });

    it.each([
      ['an unknown status', { status: 'OPEN' }],
      ['a page below 1', { page: 0 }],
      ['a limit above 100', { limit: 101 }],
    ])('returns 400 for %s', async (_label, query) => {
      const response = await list(query).expect(400);

      expect(response.body.error).toBe('VALIDATION_ERROR');
    });

    it('never exposes password or revision data', async () => {
      const response = await list({ search: marker }).expect(200);

      expect(JSON.stringify(response.body)).not.toMatch(
        /passwordHash|snapshot|revisions/i,
      );
      expect(JSON.stringify(response.body)).not.toContain(SNAPSHOT_MARKER);
    });
  });

  describe('GET /admin/careers/:id', () => {
    it('returns a DRAFT career with its skills, outlook, pathway steps and resources', async () => {
      const response = await detail(careerIds.draft).expect(200);

      expect(response.body).toMatchObject({
        id: careerIds.draft,
        status: 'DRAFT',
        version: 1,
        skills: [{ id: skillId, importance: 'REQUIRED' }],
        outlook: [
          {
            type: 'SALARY',
            median: '95000',
            source: { id: sourceId, name: `${marker} source` },
          },
        ],
      });

      const [step] = response.body.pathway.steps as {
        order: number;
        skills: { id: string }[];
        resources: { status: string }[];
      }[];
      expect(step.order).toBe(1);
      expect(step.skills).toEqual([{ id: skillId, name: `${marker} skill` }]);
      expect(step.resources.map((resource) => resource.status).sort()).toEqual([
        'ACTIVE',
        'WITHDRAWN',
      ]);
    });

    it.each(['published', 'retired'] as const)(
      'returns a %s career too',
      async (key) => {
        const response = await detail(careerIds[key]).expect(200);

        expect(response.body.pathway).toBeNull();
        expect(response.body.skills).toEqual([]);
      },
    );

    it('returns 404 for a career that does not exist', async () => {
      const response = await detail(
        '00000000-0000-4000-8000-000000000000',
      ).expect(404);

      expect(response.body).toMatchObject({
        error: 'NOT_FOUND',
        message: 'Career not found',
      });
    });

    it('returns 400 for an id that is not a UUID', async () => {
      await detail('not-a-uuid').expect(400);
    });

    it('never exposes password or revision data', async () => {
      const response = await detail(careerIds.draft).expect(200);
      const body = JSON.stringify(response.body);

      expect(body).not.toMatch(/passwordHash|snapshot|revisions/i);
      expect(body).not.toContain(SNAPSHOT_MARKER);
    });
  });
});
