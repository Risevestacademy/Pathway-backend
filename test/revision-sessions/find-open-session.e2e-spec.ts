import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import request from 'supertest';

import { AppModule } from '../../src/app.module';
import { apiPrefix as resolveApiPrefix, configureApp } from '../../src/common';
import { EnvironmentVariables } from '../../src/config';
import { NotificationService } from '../../src/notifications';
import { PrismaService } from '../../src/prisma';
import { RevisionStatus, Role } from '../../src/generated/prisma/client';

import { notificationMock, wireNotificationMock } from '../utils/auth';
import { registerRoles, RoleUsers } from '../utils/auth-roles';
import { findOpenSessionApi } from '../utils/http';
import {
  cleanupSession,
  seedSession,
  SessionFixture,
} from '../utils/session-factory';

describe('GET /admin/sessions — findOpenSession (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let apiPrefix: string;
  let users: RoleUsers;

  const marker = `e2e-find-open-${Date.now()}`;
  const fixtures: SessionFixture[] = [];

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
      roles: [Role.USER, Role.EDITOR, Role.REVIEWER],
    });
  });

  afterAll(async () => {
    for (const f of fixtures) await cleanupSession(prisma, f);
    await users.cleanup();
    await app.close();
  });

  it("returns the current editor's open DRAFT session", async () => {
    const fixture = await seedSession(prisma, {
      marker: `${marker}-draft`,
      createdById: users.ids[Role.EDITOR],
      contextId: null,
      createCareer: true,
      revisions: [],
    });
    fixtures.push(fixture);

    const res = await findOpenSessionApi(
      app,
      apiPrefix,
      users.tokens[Role.EDITOR],
      {
        contextType: 'CAREER',
        contextId: fixture.contextId,
      },
    ).expect(200);

    expect(res.body).toMatchObject({
      id: fixture.sessionId,
      status: RevisionStatus.DRAFT,
      contextId: fixture.contextId,
    });
  });

  it('returns null when no session exists for the context', async () => {
    const res = await findOpenSessionApi(
      app,
      apiPrefix,
      users.tokens[Role.EDITOR],
      {
        contextType: 'CAREER',
        contextId: '00000000-0000-4000-8000-000000000000',
      },
    ).expect(200);

    // Nest returns `null` with 200 for a plain `null` return. The body will
    // be empty or `{}` depending on serialization; both mean "no session".
    expect(
      res.body === null ||
        res.body === '' ||
        Object.keys(res.body).length === 0,
    ).toBe(true);
  });

  it("returns null when the user's session is IN_REVIEW (only DRAFT counts)", async () => {
    const fixture = await seedSession(prisma, {
      marker: `${marker}-inreview`,
      createdById: users.ids[Role.EDITOR],
      contextId: null,
      createCareer: true,
      status: RevisionStatus.IN_REVIEW,
      revisions: [],
    });
    fixtures.push(fixture);

    const res = await findOpenSessionApi(
      app,
      apiPrefix,
      users.tokens[Role.EDITOR],
      {
        contextType: 'CAREER',
        contextId: fixture.contextId,
      },
    ).expect(200);

    expect(
      res.body === null ||
        res.body === '' ||
        Object.keys(res.body).length === 0,
    ).toBe(true);
  });

  it("does not return another editor's session", async () => {
    const fixture = await seedSession(prisma, {
      marker: `${marker}-otherowner`,
      createdById: users.ids[Role.EDITOR],
      contextId: null,
      createCareer: true,
      revisions: [],
    });
    fixtures.push(fixture);

    // REVIEWER is not the creator. The query is scoped by createdById, so
    // the reviewer sees "no session of mine for this context".
    const res = await findOpenSessionApi(
      app,
      apiPrefix,
      users.tokens[Role.REVIEWER],
      {
        contextType: 'CAREER',
        contextId: fixture.contextId,
      },
    ).expect(200);

    expect(
      res.body === null ||
        res.body === '' ||
        Object.keys(res.body).length === 0,
    ).toBe(true);
  });

  it('returns 403 to a USER', async () => {
    const res = await findOpenSessionApi(
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

  it('returns 401 without a token', async () => {
    await request(app.getHttpServer())
      .get(`${apiPrefix}/admin/sessions`)
      .query({
        contextType: 'CAREER',
        contextId: '00000000-0000-4000-8000-000000000000',
      })
      .expect(401);
  });

  it('returns 400 when contextType is missing', async () => {
    const res = await request(app.getHttpServer())
      .get(`${apiPrefix}/admin/sessions`)
      .query({ contextId: '00000000-0000-4000-8000-000000000000' })
      .set('Authorization', `Bearer ${users.tokens[Role.EDITOR]}`)
      .expect(400);
    expect(res.body.message).toBeTruthy();
  });

  it('returns 400 when contextType is not a ContentType', async () => {
    const res = await request(app.getHttpServer())
      .get(`${apiPrefix}/admin/sessions`)
      .query({
        contextType: 'NOT_A_TYPE',
        contextId: '00000000-0000-4000-8000-000000000000',
      })
      .set('Authorization', `Bearer ${users.tokens[Role.EDITOR]}`)
      .expect(400);
    expect(res.body.message).toBeTruthy();
  });

  it('returns 400 when contextId is empty', async () => {
    const res = await request(app.getHttpServer())
      .get(`${apiPrefix}/admin/sessions`)
      .query({ contextType: 'CAREER', contextId: '' })
      .set('Authorization', `Bearer ${users.tokens[Role.EDITOR]}`)
      .expect(400);
    expect(res.body.message).toBeTruthy();
  });
});
