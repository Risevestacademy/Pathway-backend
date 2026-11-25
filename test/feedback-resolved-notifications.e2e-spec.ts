import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { apiPrefix as resolveApiPrefix, configureApp } from '../src/common';
import { EnvironmentVariables } from '../src/config';
import { NotificationCategory, Role } from '../src/generated/prisma/client';
import {
  NotificationDispatcher,
  NotificationService,
} from '../src/notifications';
import { PrismaService } from '../src/prisma';
import {
  cleanupUsers,
  notificationMock,
  registerAndVerify,
  wireNotificationMock,
  type RegisteredUser,
} from './utils/auth';

describe('Feedback resolved notifications (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let dispatcher: NotificationDispatcher;
  let apiPrefix: string;
  let submitter: RegisteredUser;
  let admin: RegisteredUser;

  const marker = `e2e-feedback-resolved-${Date.now()}`;
  const userIds: string[] = [];

  const submit = async (as: RegisteredUser | null, label: string) => {
    const description = `${marker} ${label}`;
    const req = request(app.getHttpServer()).post(`${apiPrefix}/feedback`);
    if (as) req.set('Authorization', `Bearer ${as.accessToken}`);
    await req.send({ category: 'OTHER', description }).expect(201);

    return prisma.contentFeedback.findFirstOrThrow({
      where: { description },
      select: { id: true, submittedById: true },
    });
  };

  const triage = (
    feedbackId: string,
    body: { status: string; resolution?: string },
    token = admin.accessToken,
  ) =>
    request(app.getHttpServer())
      .patch(`${apiPrefix}/admin/feedback/${feedbackId}`)
      .set('Authorization', `Bearer ${token}`)
      .send(body);

  const resolve = (feedbackId: string, resolution = 'FIXED') =>
    triage(feedbackId, { status: 'RESOLVED', resolution });

  const addNote = (feedbackId: string) =>
    request(app.getHttpServer())
      .post(`${apiPrefix}/admin/feedback/${feedbackId}/notes`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ body: 'We have looked at this.' });

  const inbox = () =>
    request(app.getHttpServer())
      .get(`${apiPrefix}/me/notifications`)
      .set('Authorization', `Bearer ${submitter.accessToken}`);

  const unreadCount = () =>
    request(app.getHttpServer())
      .get(`${apiPrefix}/me/notifications/unread-count`)
      .set('Authorization', `Bearer ${submitter.accessToken}`);

  const notificationsAbout = (feedbackId: string) =>
    prisma.notification.count({ where: { targetId: feedbackId } });

  const statusOf = async (feedbackId: string) =>
    (
      await prisma.contentFeedback.findUniqueOrThrow({
        where: { id: feedbackId },
        select: { status: true, resolution: true },
      })
    ).status;

  const setFeedbackPreference = (
    inAppEnabled: boolean,
    emailEnabled: boolean,
  ) =>
    prisma.notificationPreference.create({
      data: {
        userId: submitter.id,
        category: NotificationCategory.FEEDBACK_REPLIES,
        inAppEnabled,
        emailEnabled,
      },
    });

  const waitForEmail = async (
    to: string,
    template: string,
    timeoutMs = 2000,
  ) => {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (
        notificationMock.send.mock.calls.some(
          ([address, name]) => address === to && name === template,
        )
      ) {
        return;
      }
      await new Promise((done) => setTimeout(done, 20));
    }
    throw new Error(`No ${template} email sent to ${to}`);
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
    dispatcher = app.get(NotificationDispatcher);
    await app.listen(0, '127.0.0.1');

    wireNotificationMock();

    submitter = await registerAndVerify(app, apiPrefix, {
      email: `${marker}-submitter@test.com`,
    });
    userIds.push(submitter.id);

    const adminEmail = `${marker}-admin@test.com`;
    const registered = await registerAndVerify(app, apiPrefix, {
      email: adminEmail,
    });
    userIds.push(registered.id);
    await prisma.user.update({
      where: { id: registered.id },
      data: { role: Role.ADMIN },
    });
    const login = await request(app.getHttpServer())
      .post(`${apiPrefix}/auth/login`)
      .send({ email: adminEmail, password: 'Password123!' })
      .expect(200);
    admin = {
      id: registered.id,
      email: adminEmail,
      accessToken: (login.body as { accessToken: string }).accessToken,
    };
  });

  beforeEach(async () => {
    notificationMock.send.mockClear();
    await prisma.notification.deleteMany({ where: { userId: submitter.id } });
    await prisma.notificationPreference.deleteMany({
      where: { userId: submitter.id },
    });
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.contentFeedback.deleteMany({
        where: { description: { startsWith: marker } },
      });
      await cleanupUsers(prisma, userIds);
    }
    if (app) await app.close();
  });

  describe('resolving', () => {
    it('puts one resolved notification in the submitter inbox, with the feedback as target', async () => {
      const feedback = await submit(submitter, 'resolve');

      const response = await resolve(feedback.id).expect(200);
      expect(response.body).toMatchObject({
        id: feedback.id,
        status: 'RESOLVED',
        resolution: 'FIXED',
      });

      const page = await inbox().expect(200);
      expect(page.body.items).toHaveLength(1);
      expect(page.body.items[0]).toMatchObject({
        type: 'FEEDBACK_RESOLVED',
        category: 'FEEDBACK_REPLIES',
        title: 'Your feedback was resolved',
        isRead: false,
        targetType: 'FEEDBACK',
        targetId: feedback.id,
      });
      expect((await unreadCount().expect(200)).body).toEqual({ count: 1 });
    });

    it('keeps replied and resolved as two distinct notifications with their own copy', async () => {
      const feedback = await submit(submitter, 'reply then resolve');

      await addNote(feedback.id).expect(201);
      await resolve(feedback.id).expect(200);

      const page = await inbox().expect(200);
      const items = page.body.items as { type: string; title: string }[];
      expect(items.map((item) => item.type).sort()).toEqual([
        'FEEDBACK_REPLIED',
        'FEEDBACK_RESOLVED',
      ]);
      expect(new Set(items.map((item) => item.title)).size).toBe(2);
    });

    it('sends the resolved email, with its own template, after the commit when email is on', async () => {
      await setFeedbackPreference(true, true);
      const feedback = await submit(submitter, 'resolve email');

      await resolve(feedback.id).expect(200);

      await waitForEmail(submitter.email, 'feedback-resolved');
      expect(notificationMock.send).toHaveBeenCalledWith(
        submitter.email,
        'feedback-resolved',
        {},
      );
    });
  });

  describe('no duplicate and no early notification', () => {
    it('creates no second notification when a resolved report is saved again', async () => {
      const feedback = await submit(submitter, 'resave');
      await resolve(feedback.id).expect(200);

      await resolve(feedback.id).expect(200);
      await resolve(feedback.id, 'NOT_AN_ISSUE').expect(200);

      expect(await notificationsAbout(feedback.id)).toBe(1);
      expect(
        (
          await prisma.contentFeedback.findUniqueOrThrow({
            where: { id: feedback.id },
          })
        ).resolution,
      ).toBe('NOT_AN_ISSUE');
    });

    it('creates nothing for NEW to UNDER_REVIEW', async () => {
      const feedback = await submit(submitter, 'under review');

      await triage(feedback.id, { status: 'UNDER_REVIEW' }).expect(200);

      expect(await statusOf(feedback.id)).toBe('UNDER_REVIEW');
      expect(await notificationsAbout(feedback.id)).toBe(0);
      expect(notificationMock.send).not.toHaveBeenCalled();
    });

    it('notifies when a report in review is resolved, and again only if it is reopened and resolved', async () => {
      const feedback = await submit(submitter, 'review then resolve');
      await triage(feedback.id, { status: 'UNDER_REVIEW' }).expect(200);
      expect(await notificationsAbout(feedback.id)).toBe(0);

      await resolve(feedback.id).expect(200);
      expect(await notificationsAbout(feedback.id)).toBe(1);

      await triage(feedback.id, { status: 'NEW' }).expect(200);
      expect(await notificationsAbout(feedback.id)).toBe(1);

      await resolve(feedback.id).expect(200);
      expect(await notificationsAbout(feedback.id)).toBe(2);
    });

    it('creates one notification when two resolve requests race', async () => {
      const feedback = await submit(submitter, 'race');

      const responses = await Promise.all([
        resolve(feedback.id),
        resolve(feedback.id),
      ]);

      expect(responses.map((response) => response.status)).toEqual([200, 200]);
      expect(await notificationsAbout(feedback.id)).toBe(1);
    });
  });

  describe('who is notified', () => {
    it('creates nothing for anonymous feedback, and the report is still resolved', async () => {
      const feedback = await submit(null, 'anonymous');

      await resolve(feedback.id).expect(200);

      expect(await statusOf(feedback.id)).toBe('RESOLVED');
      expect(await notificationsAbout(feedback.id)).toBe(0);
      expect(notificationMock.send).not.toHaveBeenCalled();
    });

    it('creates nothing when the submitter resolves their own feedback', async () => {
      const feedback = await submit(admin, 'self resolve');
      expect(feedback.submittedById).toBe(admin.id);

      await resolve(feedback.id).expect(200);

      expect(await statusOf(feedback.id)).toBe('RESOLVED');
      expect(await notificationsAbout(feedback.id)).toBe(0);
    });

    it('writes the change and leaves the inbox empty when the feedback preference is off', async () => {
      await setFeedbackPreference(false, false);
      const feedback = await submit(submitter, 'preference off');

      await resolve(feedback.id).expect(200);

      expect(await statusOf(feedback.id)).toBe('RESOLVED');
      expect((await inbox().expect(200)).body).toEqual({
        items: [],
        nextCursor: null,
      });
      expect((await unreadCount().expect(200)).body).toEqual({ count: 0 });
      expect(notificationMock.send).not.toHaveBeenCalled();
    });

    it('returns 404 and writes nothing for feedback that does not exist', async () => {
      const missing = '00000000-0000-4000-8000-000000000000';

      await resolve(missing).expect(404);

      expect(await notificationsAbout(missing)).toBe(0);
    });

    it('returns 400 and writes nothing when RESOLVED has no resolution', async () => {
      const feedback = await submit(submitter, 'no resolution');

      await triage(feedback.id, { status: 'RESOLVED' }).expect(400);

      expect(await statusOf(feedback.id)).toBe('NEW');
      expect(await notificationsAbout(feedback.id)).toBe(0);
    });
  });

  describe('rollback', () => {
    it('leaves no status change and no notification when the write fails after the notification row', async () => {
      const feedback = await submit(submitter, 'rollback');
      const real = dispatcher.feedbackResolved.bind(dispatcher);
      const spy = jest
        .spyOn(dispatcher, 'feedbackResolved')
        .mockImplementationOnce(async (input, tx) => {
          await real(input, tx);
          throw new Error('failed after the notification was written');
        });

      try {
        await resolve(feedback.id).expect(500);
      } finally {
        spy.mockRestore();
      }

      expect(await statusOf(feedback.id)).toBe('NEW');
      expect(await notificationsAbout(feedback.id)).toBe(0);
      expect(notificationMock.send).not.toHaveBeenCalled();

      // Nothing was left behind, so a retry notifies once
      await resolve(feedback.id).expect(200);
      expect(await notificationsAbout(feedback.id)).toBe(1);
    });
  });
});
