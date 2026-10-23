import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { apiPrefix as resolveApiPrefix, configureApp } from '../src/common';
import { EnvironmentVariables } from '../src/config';
import { NotificationService } from '../src/notifications';
import { PrismaService } from '../src/prisma';
import { FeedbackStatus, Role } from '../src/generated/prisma/client';
import {
  notificationMock,
  registerAndVerify,
  wireNotificationMock,
} from './utils/auth';

describe('Admin feedback (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let apiPrefix: string;

  const userIds: string[] = [];
  const tokens = {} as Record<Role, string>;
  let adminToken: string;
  let fieldId: string;
  let careerId: string;
  const feedbackIds: Record<string, string> = {};

  const password = 'Password123!';
  const timestamp = Date.now();
  const marker = `e2e-admin-feedback-${timestamp}`;

  const list = (query: Record<string, string | number>, token = adminToken) =>
    request(app.getHttpServer())
      .get(`${apiPrefix}/admin/feedback`)
      .query(query)
      .set('Authorization', `Bearer ${token}`);

  const patchStatus = (id: string, body: unknown, token = adminToken) =>
    request(app.getHttpServer())
      .patch(`${apiPrefix}/admin/feedback/${id}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send(body as object);

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
      userIds.push(registered.id);
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
    adminToken = tokens[Role.ADMIN];

    const field = await prisma.field.create({
      data: {
        name: `Admin Feedback Field ${timestamp}`,
        slug: `${marker}-field`,
      },
    });
    fieldId = field.id;
    const career = await prisma.career.create({
      data: {
        slug: `${marker}-career`,
        title: `Admin Feedback Career ${timestamp}`,
        description: 'd',
        roleSummary: 'r',
        exampleActivities: [],
        fieldId,
      },
    });
    careerId = career.id;

    const seeds: [string, FeedbackStatus][] = [
      ['oldest', FeedbackStatus.NEW],
      ['middle', FeedbackStatus.RESOLVED],
      ['newest', FeedbackStatus.NEW],
    ];
    for (const [index, [label, status]] of seeds.entries()) {
      const created = await prisma.contentFeedback.create({
        data: {
          category: 'OTHER',
          description: `${marker} ${label}`,
          careerId,
          status,
          createdAt: new Date(Date.UTC(2026, 9, 20 + index)),
        },
      });
      feedbackIds[label] = created.id;
    }
  });

  afterAll(async () => {
    await prisma.contentFeedback.deleteMany({ where: { careerId } });
    await prisma.career.deleteMany({ where: { id: careerId } });
    await prisma.field.deleteMany({ where: { id: fieldId } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await app.close();
  });

  describe('authorization', () => {
    it('returns 401 without an access token', async () => {
      const response = await request(app.getHttpServer())
        .get(`${apiPrefix}/admin/feedback`)
        .expect(401);

      expect(response.body.error).toBe('UNAUTHORIZED');
    });

    it.each([Role.USER, Role.REVIEWER, Role.PUBLISHER])(
      'returns 403 to %s on both routes',
      async (role) => {
        await list({}, tokens[role]).expect(403);
        const response = await patchStatus(
          feedbackIds.oldest,
          { status: 'RESOLVED' },
          tokens[role],
        ).expect(403);

        expect(response.body.error).toBe('FORBIDDEN');
      },
    );

    it('lets an EDITOR list feedback and update its status', async () => {
      await list({ careerId }, tokens[Role.EDITOR]).expect(200);
      const response = await patchStatus(
        feedbackIds.middle,
        { status: 'RESOLVED' },
        tokens[Role.EDITOR],
      ).expect(200);

      expect(response.body.status).toBe('RESOLVED');
    });
  });

  describe('GET /admin/feedback', () => {
    it('lists feedback for a career newest first with the total', async () => {
      const response = await list({ careerId }).expect(200);

      expect(response.body).toMatchObject({ total: 3, page: 1, limit: 20 });
      expect(
        (response.body.items as { id: string }[]).map((item) => item.id),
      ).toEqual([feedbackIds.newest, feedbackIds.middle, feedbackIds.oldest]);
    });

    it('filters by status', async () => {
      const response = await list({ careerId, status: 'NEW' }).expect(200);

      expect(response.body.total).toBe(2);
      expect(
        (response.body.items as { status: string }[]).every(
          (item) => item.status === 'NEW',
        ),
      ).toBe(true);
    });

    it('paginates with page and limit', async () => {
      const response = await list({ careerId, page: 2, limit: 2 }).expect(200);

      expect(response.body).toMatchObject({ total: 3, page: 2, limit: 2 });
      expect(
        (response.body.items as { id: string }[]).map((item) => item.id),
      ).toEqual([feedbackIds.oldest]);
    });

    it.each([
      ['an unknown status', { status: 'OPEN' }],
      ['a non-UUID careerId', { careerId: 'career-1' }],
      ['a page below 1', { page: 0 }],
      ['a page above 10000', { page: 10001 }],
      ['a limit above 100', { limit: 101 }],
    ])('returns 400 for %s', async (_label, query) => {
      const response = await list(query).expect(400);

      expect(response.body.error).toBe('VALIDATION_ERROR');
    });
  });

  describe('PATCH /admin/feedback/:id/status', () => {
    it('updates the status and returns the updated record', async () => {
      const before = await prisma.contentFeedback.findUniqueOrThrow({
        where: { id: feedbackIds.oldest },
      });

      const response = await patchStatus(feedbackIds.oldest, {
        status: 'UNDER_REVIEW',
      }).expect(200);

      expect(response.body).toMatchObject({
        id: feedbackIds.oldest,
        status: 'UNDER_REVIEW',
        description: `${marker} oldest`,
      });
      const after = await prisma.contentFeedback.findUniqueOrThrow({
        where: { id: feedbackIds.oldest },
      });
      expect(after.status).toBe('UNDER_REVIEW');
      expect(after.updatedAt.getTime()).toBeGreaterThan(
        before.updatedAt.getTime(),
      );
    });

    it('returns 404 for feedback that does not exist', async () => {
      const response = await patchStatus(
        '00000000-0000-4000-8000-000000000000',
        { status: 'RESOLVED' },
      ).expect(404);

      expect(response.body).toMatchObject({
        error: 'NOT_FOUND',
        message: 'Feedback not found',
      });
    });

    it('returns 400 for a status outside FeedbackStatus', async () => {
      const response = await patchStatus(feedbackIds.middle, {
        status: 'CLOSED',
      }).expect(400);

      expect(response.body.error).toBe('VALIDATION_ERROR');
    });

    it('returns 400 for an id that is not a UUID', async () => {
      await patchStatus('feedback-1', { status: 'RESOLVED' }).expect(400);
    });
  });
});
