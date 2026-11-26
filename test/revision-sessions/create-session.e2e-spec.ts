import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { INestApplication } from '@nestjs/common';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from '@jest/globals';

import { AppModule } from '../../src/app.module';
import { apiPrefix as resolveApiPrefix, configureApp } from '../../src/common';
import { EnvironmentVariables } from '../../src/config';
import { NotificationService } from '../../src/notifications';
import { PrismaService } from '../../src/prisma';
import {
  ContentType,
  RevisionStatus,
  Role,
} from '../../src/generated/prisma/client';

import {
  notificationMock,
  wireNotificationMock,
  registerAndVerify,
} from '../utils/auth';
import { registerRoles, RoleUsers } from '../utils/auth-roles';
import { createSessionApi } from '../utils/http';
import { cleanupSession, SessionFixture } from '../utils/session-factory';
import request from 'supertest';

describe('POST /admin/sessions (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let apiPrefix: string;
  let users: RoleUsers;

  const password = 'Password123!';
  const marker = `e2e-create-session-${Date.now()}`;
  const fixtures: SessionFixture[] = [];
  const careerIds: string[] = [];
  const fieldIds: string[] = [];
  const extraUserIds: string[] = [];

  // Minimal valid career snapshot for the `initialSnapshot` field.
  const careerSnapshot = (key: string, fieldId: string) => ({
    career: {
      title: `Career ${key}`,
      slug: `career-${key}`,
      description: 'A description.',
      roleSummary: null,
      fieldId,
      targetLevels: [],
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

  const createField = async (suffix: string): Promise<string> => {
    const field = await prisma.field.create({
      data: {
        name: `Field ${marker}-${suffix}`,
        slug: `field-${marker}-${suffix}`,
      },
    });
    fieldIds.push(field.id);
    return field.id;
  };

  const createPublishedCareer = async (suffix: string): Promise<string> => {
    const fieldId = await createField(suffix);
    const career = await prisma.career.create({
      data: {
        slug: `existing-${marker}-${suffix}`,
        title: `Existing ${marker}-${suffix}`,
        description: 'd',
        exampleActivities: [],
        fieldId,
        status: 'PUBLISHED',
        version: 1,
      },
    });
    careerIds.push(career.id);
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
    await app.listen(0, '127.0.0.1');
    wireNotificationMock();

    users = await registerRoles(app, apiPrefix, prisma, {
      marker,
      roles: [Role.USER, Role.EDITOR],
    });
  });

  afterAll(async () => {
    for (const fixture of fixtures) {
      await cleanupSession(prisma, fixture);
    }
    if (extraUserIds.length > 0) {
      await prisma.user.deleteMany({ where: { id: { in: extraUserIds } } });
    }
    if (careerIds.length > 0) {
      await prisma.career.deleteMany({ where: { id: { in: careerIds } } });
    }
    if (fieldIds.length > 0) {
      await prisma.field.deleteMany({ where: { id: { in: fieldIds } } });
    }
    await users.cleanup();
    await app.close();
  });

  // ───────────────────────────────────────────────────────────────────
  // Mode 1: existing career
  // ───────────────────────────────────────────────────────────────────

  it('opens a session against an existing career', async () => {
    const careerId = await createPublishedCareer('existing');

    const res = await createSessionApi(
      app,
      apiPrefix,
      users.tokens[Role.EDITOR],
      {
        contextType: 'CAREER',
        contextId: careerId,
      },
    ).expect(201);

    expect(res.body).toMatchObject({
      contextType: 'CAREER',
      contextId: careerId,
      status: RevisionStatus.DRAFT,
      createdById: users.ids[Role.EDITOR],
      revisions: [],
      submittedAt: null,
      publishedAt: null,
    });

    // Register the session for cleanup. We did not create the career here;
    // the fixture's cleanup deletes the session and only deletes the career
    // if it's still DRAFT. Here the career is PUBLISHED, so it survives.
    fixtures.push({
      marker: `${marker}-existing`,
      sessionId: res.body.id,
      contextType: ContentType.CAREER,
      contextId: careerId,
      createdById: users.ids[Role.EDITOR],
      revisionIds: [],
      careerId,
    });
  });

  // ───────────────────────────────────────────────────────────────────
  // Mode 2: new career
  // ───────────────────────────────────────────────────────────────────

  it('creates a DRAFT Career and opens a session when contextId is null', async () => {
    const fieldId = await createField('new');

    const res = await createSessionApi(
      app,
      apiPrefix,
      users.tokens[Role.EDITOR],
      {
        contextType: 'CAREER',
        contextId: null,
        initialSnapshot: careerSnapshot('new', fieldId),
      },
    ).expect(201);

    expect(res.body).toMatchObject({
      contextType: 'CAREER',
      status: RevisionStatus.DRAFT,
      createdById: users.ids[Role.EDITOR],
      revisions: [],
    });
    expect(res.body.contextId).toBeTruthy();

    // A DRAFT Career should have been created at that contextId.
    const career = await prisma.career.findUniqueOrThrow({
      where: { id: res.body.contextId },
    });
    expect(career.status).toBe('DRAFT');
    expect(career.title).toBe(`Career new`);
    expect(career.slug).toBe(`career-new`);
    expect(career.fieldId).toBe(fieldId);

    fixtures.push({
      marker: `${marker}-new`,
      sessionId: res.body.id,
      contextType: ContentType.CAREER,
      contextId: res.body.contextId,
      createdById: users.ids[Role.EDITOR],
      revisionIds: [],
      careerId: res.body.contextId,
    });
  });

  it('rejects null contextId for CAREER when initialSnapshot is missing', async () => {
    const res = await createSessionApi(
      app,
      apiPrefix,
      users.tokens[Role.EDITOR],
      {
        contextType: 'CAREER',
        contextId: null,
      },
    ).expect(400);
    expect(res.body).toMatchObject({
      code: 'VALIDATION_FAILED',
    });
    expect(res.body.message).toMatch(/initialSnapshot is required/);
  });

  it('rejects a null contextId for non-CAREER content types', async () => {
    const res = await createSessionApi(
      app,
      apiPrefix,
      users.tokens[Role.EDITOR],
      {
        contextType: 'RESOURCE',
        contextId: null,
      },
    ).expect(400);
    expect(res.body.code).toBe('UNSUPPORTED_CONTENT_TYPE');
  });

  // ───────────────────────────────────────────────────────────────────
  // Existing open session → 409
  // ───────────────────────────────────────────────────────────────────

  it('returns 409 SESSION_ALREADY_OPEN when an open session exists', async () => {
    const careerId = await createPublishedCareer('conflict');
    const first = await createSessionApi(
      app,
      apiPrefix,
      users.tokens[Role.EDITOR],
      {
        contextType: 'CAREER',
        contextId: careerId,
      },
    ).expect(201);
    fixtures.push({
      marker: `${marker}-conflict`,
      sessionId: first.body.id,
      contextType: ContentType.CAREER,
      contextId: careerId,
      createdById: users.ids[Role.EDITOR],
      revisionIds: [],
      careerId,
    });

    const res = await createSessionApi(
      app,
      apiPrefix,
      users.tokens[Role.EDITOR],
      {
        contextType: 'CAREER',
        contextId: careerId,
      },
    ).expect(409);

    expect(res.body).toMatchObject({
      code: 'SESSION_ALREADY_OPEN',
      details: { sessionId: first.body.id },
    });
  });

  it('allows a different editor to open a session on the same career', async () => {
    const careerId = await createPublishedCareer('multi-editor');

    const a = await createSessionApi(
      app,
      apiPrefix,
      users.tokens[Role.EDITOR],
      {
        contextType: 'CAREER',
        contextId: careerId,
      },
    ).expect(201);
    fixtures.push({
      marker: `${marker}-me-a`,
      sessionId: a.body.id,
      contextType: ContentType.CAREER,
      contextId: careerId,
      createdById: users.ids[Role.EDITOR],
      revisionIds: [],
      careerId,
    });

    // SECOND editor — a fresh user, with its own "open session" scope. This
    // also proves the createdById filter: editor B's session on the same
    // career doesn't collide with editor A's.
    const otherEditorEmail = `${marker}-editor2@test.com`;
    const registered = await registerAndVerify(app, apiPrefix, {
      email: otherEditorEmail,
      password,
    });
    extraUserIds.push(registered.id);
    await prisma.user.update({
      where: { id: registered.id },
      data: { role: Role.EDITOR },
    });
    const login = await request(app.getHttpServer())
      .post(`${apiPrefix}/auth/login`)
      .send({ email: otherEditorEmail, password })
      .expect(200);
    const otherToken = (login.body as { accessToken: string }).accessToken;

    const b = await createSessionApi(app, apiPrefix, otherToken, {
      contextType: 'CAREER',
      contextId: careerId,
    }).expect(201);
    fixtures.push({
      marker: `${marker}-me-b`,
      sessionId: b.body.id,
      contextType: ContentType.CAREER,
      contextId: careerId,
      createdById: registered.id,
      revisionIds: [],
      careerId,
    });
  });

  // ───────────────────────────────────────────────────────────────────
  // Errors: missing career, missing auth, wrong role
  // ───────────────────────────────────────────────────────────────────

  it('returns 404 when the supplied contextId does not exist', async () => {
    const res = await createSessionApi(
      app,
      apiPrefix,
      users.tokens[Role.EDITOR],
      {
        contextType: 'CAREER',
        contextId: '00000000-0000-4000-8000-000000000000',
      },
    ).expect(404);
    expect(res.body.code).toBe('SESSION_NOT_FOUND');
  });

  it('returns 401 without a token', async () => {
    const res = await request(app.getHttpServer())
      .post(`${apiPrefix}/admin/sessions`)
      .send({
        contextType: 'CAREER',
        contextId: '00000000-0000-4000-8000-000000000000',
      })
      .expect(401);
    expect(res.body.message).toBeTruthy();
  });

  it('returns 403 to a USER', async () => {
    const res = await createSessionApi(
      app,
      apiPrefix,
      users.tokens[Role.USER],
      {
        contextType: 'CAREER',
        contextId: '00000000-0000-4000-8000-000000000000',
      },
    ).expect(403);
    expect(res.body.error).toBe('FORBIDDEN');
  });

  // Silence unused-import lint: `beforeEach`, `ContentType` are used above
  // but the linter may not always see it.
  void beforeEach;
  void ContentType;
});
