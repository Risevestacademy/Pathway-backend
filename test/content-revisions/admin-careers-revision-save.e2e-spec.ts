import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { AppModule } from '../../src/app.module';
import { apiPrefix as resolveApiPrefix, configureApp } from '../../src/common';
import { EnvironmentVariables } from '../../src/config';
import { NotificationService } from '../../src/notifications';
import { PrismaService } from '../../src/prisma';
import {
  CareerStatus,
  RevisionStatus,
  Role,
} from '../../src/generated/prisma/client';
import type { CareerSnapshot } from '../../src/catalog/content-revisions';
import {
  notificationMock,
  registerAndVerify,
  wireNotificationMock,
} from '../utils/auth';

type SaveBody = {
  id: string;
  careerId: string;
  status: RevisionStatus;
  baseVersion: number;
  created: boolean;
};

type ErrorBody = {
  error: string;
  code?: string;
  details?: Record<string, unknown>;
  fields?: Record<string, string>;
};

describe('Admin career revision save (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let apiPrefix: string;

  const userIds = {} as Record<Role, string>;
  const tokens = {} as Record<Role, string>;
  const careerIds: Record<string, string> = {};
  let fieldId: string;
  let skillId: string;
  let resourceId: string;

  const password = 'Password123!';
  const timestamp = Date.now();
  const marker = `e2e-revision-save-${timestamp}`;

  const makeSnapshot = (title = 'DevOps Engineer'): CareerSnapshot => ({
    schemaVersion: 1,
    career: {
      title,
      slug: 'devops-engineer',
      description: 'Automates how software is built, tested and deployed.',
      roleSummary: null,
      fieldId,
      targetLevels: ['RECENT_GRAD'],
      exampleActivities: ['Write pipelines'],
      typicalEducationNote: null,
      certificationsNote: 'Rarely required.',
    },
    pathway: { title: 'DevOps Roadmap', description: null },
    steps: [
      {
        id: 'new-1',
        order: 1,
        title: 'Linux basics',
        description: null,
        learningObjective: 'Use a shell',
        prerequisites: null,
        expectedActivity: 'Complete the course',
        skillIds: [skillId],
        resourceIds: [resourceId, 'new-1'],
      },
    ],
    skills: [{ skillId, importance: 'REQUIRED' }],
    outlook: [
      {
        id: 'new-1',
        type: 'SALARY',
        geography: 'Lagos, Nigeria',
        period: '2026',
        sourceId: null,
        median: '6500000.00',
        percentile25: null,
        percentile75: null,
        currency: 'NGN',
        payPeriod: 'year',
        grossOrNet: 'gross',
        experienceLevel: 'entry-level',
        baseYear: null,
        baseValue: null,
        projectedYear: null,
        projectedValue: null,
        growthPercent: null,
        demandLevel: null,
      },
    ],
    resources: [
      {
        id: 'new-1',
        title: 'Intro to CI',
        description: null,
        url: 'https://example.com/ci',
        type: 'COURSE',
        provider: 'Example',
        costStatus: 'FREE',
        certificationCost: null,
        curationRationale: 'Clear and free.',
        lastCheckedDate: '2026-10-01',
      },
    ],
  });

  const save = (
    careerId: string,
    payload: unknown,
    token: string | null = tokens[Role.EDITOR],
  ) => {
    const req = request(app.getHttpServer())
      .put(`${apiPrefix}/admin/careers/${careerId}/revision`)
      .send(payload as object);
    return token ? req.set('Authorization', `Bearer ${token}`) : req;
  };

  const openRevisions = (careerId: string) =>
    prisma.contentRevision.findMany({
      where: {
        careerId,
        status: { in: [RevisionStatus.DRAFT, RevisionStatus.IN_REVIEW] },
      },
    });

  const makeCareer = async (
    label: string,
    status: CareerStatus,
    version = 1,
  ) => {
    const career = await prisma.career.create({
      data: {
        slug: `${marker}-${label}`,
        title: `Revision Save ${label} ${timestamp}`,
        description: 'd',
        fieldId,
        status,
        version,
      },
    });
    careerIds[label] = career.id;
    return career.id;
  };

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
      data: { name: `Revision Field ${timestamp}`, slug: `${marker}-field` },
    });
    fieldId = field.id;
    const skill = await prisma.skill.create({
      data: { name: `${marker}-skill` },
    });
    skillId = skill.id;
    const resource = await prisma.resource.create({
      data: {
        title: `${marker}-resource`,
        url: 'https://example.com/shared',
        type: 'ARTICLE',
        provider: 'Example',
        curationRationale: 'Shared',
        lastCheckedDate: new Date('2026-10-01'),
      },
    });
    resourceId = resource.id;

    await makeCareer('published', CareerStatus.PUBLISHED, 4);
    await makeCareer('race', CareerStatus.PUBLISHED, 2);
    await makeCareer('in-review', CareerStatus.PUBLISHED);
    await makeCareer('retired', CareerStatus.RETIRED);
    await makeCareer('draft', CareerStatus.DRAFT);
    await prisma.contentRevision.create({
      data: {
        careerId: careerIds['in-review'],
        baseVersion: 1,
        snapshot: makeSnapshot('Original'),
        status: RevisionStatus.IN_REVIEW,
        createdById: userIds[Role.EDITOR],
      },
    });
    await prisma.contentRevision.create({
      data: {
        careerId: careerIds.draft,
        baseVersion: 1,
        snapshot: makeSnapshot('First draft'),
        createdById: userIds[Role.ADMIN],
      },
    });
  });

  afterAll(async () => {
    await prisma.career.deleteMany({ where: { slug: { startsWith: marker } } });
    await prisma.resource.deleteMany({ where: { id: resourceId } });
    await prisma.skill.deleteMany({ where: { id: skillId } });
    await prisma.field.deleteMany({ where: { id: fieldId } });
    await prisma.user.deleteMany({
      where: { id: { in: Object.values(userIds) } },
    });
    await app.close();
  });

  describe('saving', () => {
    let firstRevisionId: string;

    it('creates a DRAFT revision at the live version and stores the snapshot exactly', async () => {
      const sent = makeSnapshot();

      const response = await save(careerIds.published, sent).expect(200);
      const body = response.body as SaveBody;

      expect(body).toEqual(
        expect.objectContaining({
          careerId: careerIds.published,
          status: RevisionStatus.DRAFT,
          baseVersion: 4,
          created: true,
        }),
      );
      firstRevisionId = body.id;

      const stored = await prisma.contentRevision.findUniqueOrThrow({
        where: { id: body.id },
      });
      expect(stored.snapshot).toEqual(sent);
      expect(stored.createdById).toBe(userIds[Role.EDITOR]);
    });

    it('updates the same revision on a second save and keeps one open revision', async () => {
      const sent = makeSnapshot('Senior DevOps Engineer');

      const response = await save(careerIds.published, sent).expect(200);
      const body = response.body as SaveBody;

      expect(body.id).toBe(firstRevisionId);
      expect(body.created).toBe(false);
      const open = await openRevisions(careerIds.published);
      expect(open).toHaveLength(1);
      expect(open[0].snapshot).toEqual(sent);
    });

    it('updates the draft revision created with a draft career, keeping its base and creator', async () => {
      const response = await save(careerIds.draft, makeSnapshot()).expect(200);
      const body = response.body as SaveBody;

      expect(body.created).toBe(false);
      const open = await openRevisions(careerIds.draft);
      expect(open).toHaveLength(1);
      expect(open[0].createdById).toBe(userIds[Role.ADMIN]);
      expect(open[0].baseVersion).toBe(1);
    });

    it('creates exactly one revision from two concurrent first saves', async () => {
      const responses = await Promise.all([
        save(careerIds.race, makeSnapshot('Race A')),
        save(careerIds.race, makeSnapshot('Race B')),
      ]);

      expect(responses.map((r) => r.status)).toEqual([200, 200]);
      expect(responses.map((r) => (r.body as SaveBody).created).sort()).toEqual(
        [false, true],
      );
      const open = await openRevisions(careerIds.race);
      expect(open).toHaveLength(1);
      expect(open[0].baseVersion).toBe(2);
    });

    it('allows an ADMIN', async () => {
      await save(
        careerIds.published,
        makeSnapshot(),
        tokens[Role.ADMIN],
      ).expect(200);
    });
  });

  describe('rejections', () => {
    it('returns 409 REVISION_IN_REVIEW and leaves the revision unchanged', async () => {
      const response = await save(
        careerIds['in-review'],
        makeSnapshot('Changed'),
      ).expect(409);

      const [open] = await openRevisions(careerIds['in-review']);
      expect(response.body).toEqual(
        expect.objectContaining({
          error: 'CONFLICT',
          code: 'REVISION_IN_REVIEW',
          details: { revisionId: open.id },
        }),
      );
      expect(open.status).toBe(RevisionStatus.IN_REVIEW);
      expect((open.snapshot as unknown as CareerSnapshot).career.title).toBe(
        'Original',
      );
    });

    it('returns 409 CAREER_RETIRED for a retired career', async () => {
      const response = await save(careerIds.retired, makeSnapshot()).expect(
        409,
      );

      expect((response.body as ErrorBody).code).toBe('CAREER_RETIRED');
      expect(await openRevisions(careerIds.retired)).toHaveLength(0);
    });

    it('returns 404 for an unknown career', async () => {
      await save('00000000-0000-4000-8000-000000000000', makeSnapshot()).expect(
        404,
      );
    });

    it('returns 400 BAD_REQUEST for a careerId that is not a UUID', async () => {
      const response = await save('not-a-uuid', makeSnapshot()).expect(400);

      expect((response.body as ErrorBody).error).toBe('BAD_REQUEST');
    });

    it('returns 403 for a USER', async () => {
      await save(careerIds.published, makeSnapshot(), tokens[Role.USER]).expect(
        403,
      );
    });

    it('returns 401 without an access token', async () => {
      await save(careerIds.published, makeSnapshot(), null).expect(401);
    });
  });

  describe('validation', () => {
    type Loose = Record<string, unknown>;
    const career = (s: CareerSnapshot) => s.career as unknown as Loose;
    const firstStep = (s: CareerSnapshot) => s.steps[0] as unknown as Loose;

    it.each<[string, (s: CareerSnapshot) => void, string]>([
      ['a missing nested field', (s) => delete career(s).title, 'career.title'],
      [
        'a missing nullable field',
        (s) => delete career(s).roleSummary,
        'career.roleSummary',
      ],
      [
        'an unsupported schema version',
        (s) => ((s as unknown as Loose).schemaVersion = 2),
        'schemaVersion',
      ],
      [
        'an invalid step id',
        (s) => (firstStep(s).id = 'step-one'),
        'steps.0.id',
      ],
      [
        'a non-decimal median',
        (s) => ((s.outlook[0] as unknown as Loose).median = 65000),
        'outlook.0.median',
      ],
      [
        'an unknown property',
        (s) => (firstStep(s).extra = true),
        'steps.0.extra',
      ],
    ])('returns 400 VALIDATION_ERROR for %s', async (_label, mutate, path) => {
      const payload = makeSnapshot();
      mutate(payload);

      const response = await save(careerIds.published, payload).expect(400);
      const body = response.body as ErrorBody;

      expect(body.error).toBe('VALIDATION_ERROR');
      expect(body.fields).toHaveProperty([path]);
    });

    it('accepts null for every nullable field', async () => {
      const payload = makeSnapshot();
      payload.pathway = null;
      payload.steps = [];
      payload.career.fieldId = null;

      await save(careerIds.published, payload).expect(200);
    });

    it('returns 400 INVALID_SNAPSHOT for duplicate step orders', async () => {
      const payload = makeSnapshot();
      payload.steps.push({ ...payload.steps[0], id: 'new-2' });

      const response = await save(careerIds.published, payload).expect(400);

      expect(response.body).toEqual(
        expect.objectContaining({
          error: 'BAD_REQUEST',
          code: 'INVALID_SNAPSHOT',
          details: { problems: ['steps.1: duplicate order of steps.0'] },
        }),
      );
    });
  });

  it('the database refuses a second open revision for one career', async () => {
    await expect(
      prisma.contentRevision.create({
        data: {
          careerId: careerIds.published,
          baseVersion: 4,
          snapshot: makeSnapshot(),
          createdById: userIds[Role.EDITOR],
        },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });
});
