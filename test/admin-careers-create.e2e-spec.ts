import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { apiPrefix as resolveApiPrefix, configureApp } from '../src/common';
import { EnvironmentVariables } from '../src/config';
import { NotificationService } from '../src/notifications';
import { PrismaService } from '../src/prisma';
import {
  CareerStatus,
  RevisionStatus,
  Role,
  TargetLevel,
} from '../src/generated/prisma/client';
import {
  notificationMock,
  registerAndVerify,
  wireNotificationMock,
} from './utils/auth';

type CreateBody = {
  id: string;
  slug: string;
  status: CareerStatus;
  version: number;
  roleSummary: string | null;
  revision: { id: string; status: RevisionStatus; baseVersion: number };
};

type ErrorBody = {
  error: string;
  code?: string;
  fields?: Record<string, string>;
};

describe('Admin career create (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let apiPrefix: string;

  const userIds = {} as Record<Role, string>;
  const tokens = {} as Record<Role, string>;
  let fieldId: string;

  const password = 'Password123!';
  const timestamp = Date.now();
  const marker = `e2e-admin-career-create-${timestamp}`;

  const body = (label: string, overrides: Record<string, unknown> = {}) => ({
    title: `Create Career ${label} ${timestamp}`,
    slug: `${marker}-${label}`,
    fieldId,
    description: 'A one-line summary.',
    ...overrides,
  });

  const create = (
    payload: object,
    token: string | null = tokens[Role.EDITOR],
  ) => {
    const req = request(app.getHttpServer())
      .post(`${apiPrefix}/admin/careers`)
      .send(payload);
    return token ? req.set('Authorization', `Bearer ${token}`) : req;
  };

  const countMarkerCareers = () =>
    prisma.career.count({ where: { slug: { startsWith: marker } } });

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

    for (const role of Object.values(Role)) {
      const email = `${marker}-${role.toLowerCase()}@test.com`;
      const registered = await registerAndVerify(app, apiPrefix, {
        email,
        password,
      });
      userIds[role] = registered.id;
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

    const field = await prisma.field.create({
      data: { name: `Create Field ${timestamp}`, slug: `${marker}-field` },
    });
    fieldId = field.id;
  });

  afterAll(async () => {
    await prisma.career.deleteMany({ where: { slug: { startsWith: marker } } });
    await prisma.field.deleteMany({ where: { id: fieldId } });
    await prisma.user.deleteMany({
      where: { id: { in: Object.values(userIds) } },
    });
    await app.close();
  });

  it('creates a DRAFT career at version 1 with a DRAFT revision', async () => {
    const response = await create(
      body('editor', {
        roleSummary: '  Runs the delivery pipelines.  ',
        targetLevels: [TargetLevel.RECENT_GRAD],
      }),
    ).expect(201);
    const created = response.body as CreateBody;

    expect(created).toEqual(
      expect.objectContaining({
        slug: `${marker}-editor`,
        status: CareerStatus.DRAFT,
        version: 1,
        roleSummary: 'Runs the delivery pipelines.',
        targetLevels: [TargetLevel.RECENT_GRAD],
        fieldId,
        revision: {
          id: expect.any(String) as string,
          status: RevisionStatus.DRAFT,
          baseVersion: 1,
        },
      }),
    );

    const revisions = await prisma.contentRevision.findMany({
      where: { careerId: created.id },
    });
    expect(revisions).toHaveLength(1);
    expect(revisions[0]).toEqual(
      expect.objectContaining({
        id: created.revision.id,
        status: RevisionStatus.DRAFT,
        baseVersion: 1,
        createdById: userIds[Role.EDITOR],
      }),
    );
    expect(revisions[0].snapshot).toEqual({
      schemaVersion: 1,
      career: {
        title: `Create Career editor ${timestamp}`,
        slug: `${marker}-editor`,
        description: 'A one-line summary.',
        roleSummary: 'Runs the delivery pipelines.',
        fieldId,
        targetLevels: [TargetLevel.RECENT_GRAD],
        exampleActivities: [],
        typicalEducationNote: null,
        certificationsNote: null,
      },
      pathway: null,
      steps: [],
      skills: [],
      outlook: [],
      resources: [],
    });
  });

  it('stores a missing role summary as null', async () => {
    const response = await create(body('no-role-summary')).expect(201);

    expect((response.body as CreateBody).roleSummary).toBeNull();
  });

  it.each([Role.REVIEWER, Role.PUBLISHER, Role.ADMIN])(
    'allows %s',
    async (role) => {
      await create(body(role.toLowerCase()), tokens[role]).expect(201);
    },
  );

  it('returns 403 for a USER and creates nothing', async () => {
    const before = await countMarkerCareers();

    const response = await create(body('user'), tokens[Role.USER]).expect(403);

    expect((response.body as ErrorBody).error).toBe('FORBIDDEN');
    expect(await countMarkerCareers()).toBe(before);
  });

  it('returns 401 without an access token', async () => {
    const response = await create(body('anonymous'), null).expect(401);

    expect((response.body as ErrorBody).error).toBe('UNAUTHORIZED');
  });

  it('returns 409 CAREER_TITLE_TAKEN for a title differing only in case', async () => {
    await create(body('title-original')).expect(201);
    const before = await countMarkerCareers();

    const response = await create(
      body('title-copy', {
        title: `create career TITLE-ORIGINAL ${timestamp}`,
      }),
    ).expect(409);

    expect(response.body).toEqual(
      expect.objectContaining({
        error: 'CONFLICT',
        code: 'CAREER_TITLE_TAKEN',
      }),
    );
    expect(await countMarkerCareers()).toBe(before);
  });

  it('returns 409 CAREER_SLUG_TAKEN for a slug differing only in case', async () => {
    await create(body('slug-original')).expect(201);
    const before = await countMarkerCareers();

    const response = await create(
      body('slug-copy', { slug: `${marker}-SLUG-ORIGINAL` }),
    ).expect(409);

    expect(response.body).toEqual(
      expect.objectContaining({
        error: 'CONFLICT',
        code: 'CAREER_SLUG_TAKEN',
      }),
    );
    expect(await countMarkerCareers()).toBe(before);
  });

  it('creates exactly one career from two concurrent identical requests', async () => {
    const payload = body('race');

    const responses = await Promise.all([create(payload), create(payload)]);

    expect(responses.map((r) => r.status).sort()).toEqual([201, 409]);
    const conflict = responses.find((r) => r.status === 409)!;
    expect(['CAREER_TITLE_TAKEN', 'CAREER_SLUG_TAKEN']).toContain(
      (conflict.body as ErrorBody).code,
    );
    expect(
      await prisma.career.count({ where: { slug: `${marker}-race` } }),
    ).toBe(1);
  });

  it.each(['title', 'slug', 'fieldId', 'description'])(
    'returns 400 VALIDATION_ERROR when %s is missing',
    async (key) => {
      const payload: Record<string, unknown> = body(`missing-${key}`);
      delete payload[key];

      const response = await create(payload).expect(400);

      expect((response.body as ErrorBody).error).toBe('VALIDATION_ERROR');
      expect((response.body as ErrorBody).fields).toHaveProperty(key);
    },
  );

  it('returns 400 for a slug with invalid characters', async () => {
    const response = await create(
      body('bad-slug', { slug: 'not a slug!' }),
    ).expect(400);

    expect((response.body as ErrorBody).fields).toHaveProperty('slug');
  });

  it('returns 400 FIELD_NOT_FOUND for an unknown field', async () => {
    const before = await countMarkerCareers();

    const response = await create(
      body('unknown-field', {
        fieldId: '00000000-0000-4000-8000-000000000000',
      }),
    ).expect(400);

    expect(response.body).toEqual(
      expect.objectContaining({
        error: 'BAD_REQUEST',
        code: 'FIELD_NOT_FOUND',
      }),
    );
    expect(await countMarkerCareers()).toBe(before);
  });
});
