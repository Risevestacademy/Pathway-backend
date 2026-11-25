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

describe('Feedback notifications (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let dispatcher: NotificationDispatcher;
  let apiPrefix: string;
  let submitter: RegisteredUser;
  let adminId: string;
  let adminToken: string;

  const marker = `e2e-feedback-notifications-${Date.now()}`;
  const userIds: string[] = [];

  const submit = async (as: RegisteredUser | null, label: string) => {
    const description = `${marker} ${label}`;
    const req = request(app.getHttpServer()).post(`${apiPrefix}/feedback`);
    if (as) req.set('Authorization', `Bearer ${as.accessToken}`);
    const response = await req
      .send({ category: 'OTHER', description })
      .expect(201);

    expect(response.body).toEqual({ message: 'Feedback received' });

    return prisma.contentFeedback.findFirstOrThrow({
      where: { description },
      select: { id: true, submittedById: true },
    });
  };

  const addNote = (feedbackId: string, token = adminToken) =>
    request(app.getHttpServer())
      .post(`${apiPrefix}/admin/feedback/${feedbackId}/notes`)
      .set('Authorization', `Bearer ${token}`)
      .send({ body: 'We have looked at this.' });

  const inbox = (as: RegisteredUser = submitter) =>
    request(app.getHttpServer())
      .get(`${apiPrefix}/me/notifications`)
      .set('Authorization', `Bearer ${as.accessToken}`);

  const unreadCount = (as: RegisteredUser = submitter) =>
    request(app.getHttpServer())
      .get(`${apiPrefix}/me/notifications/unread-count`)
      .set('Authorization', `Bearer ${as.accessToken}`);

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

  const notificationsAbout = (feedbackId: string) =>
    prisma.notification.count({ where: { targetId: feedbackId } });

  const waitForEmail = async (to: string, timeoutMs = 2000) => {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (
        notificationMock.send.mock.calls.some(
          ([address, template]) =>
            address === to && template === 'feedback-replied',
        )
      ) {
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    throw new Error(`No feedback-replied email sent to ${to}`);
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
    const admin = await registerAndVerify(app, apiPrefix, {
      email: adminEmail,
    });
    userIds.push(admin.id);
    adminId = admin.id;
    await prisma.user.update({
      where: { id: adminId },
      data: { role: Role.ADMIN },
    });
    const login = await request(app.getHttpServer())
      .post(`${apiPrefix}/auth/login`)
      .send({ email: adminEmail, password: 'Password123!' })
      .expect(200);
    adminToken = (login.body as { accessToken: string }).accessToken;
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

  describe('submitter identity', () => {
    it('records the signed-in caller as the submitter and returns the same body', async () => {
      const feedback = await submit(submitter, 'signed in');

      expect(feedback.submittedById).toBe(submitter.id);
    });

    it('stores no submitter for an anonymous caller', async () => {
      const feedback = await submit(null, 'anonymous');

      expect(feedback.submittedById).toBeNull();
    });
  });

  describe('reply notification', () => {
    it('puts one reply notification in the submitter inbox, with the feedback as target', async () => {
      const feedback = await submit(submitter, 'reply');

      const note = await addNote(feedback.id).expect(201);
      expect(note.body).toMatchObject({
        feedbackId: feedback.id,
        authorId: adminId,
        body: 'We have looked at this.',
      });

      const page = await inbox().expect(200);
      expect(page.body.items).toHaveLength(1);
      expect(page.body.items[0]).toMatchObject({
        type: 'FEEDBACK_REPLIED',
        category: 'FEEDBACK_REPLIES',
        title: 'We replied to your feedback',
        isRead: false,
        targetType: 'FEEDBACK',
        targetId: feedback.id,
      });
      expect((await unreadCount().expect(200)).body).toEqual({ count: 1 });
    });

    it('never puts the note text in the notification', async () => {
      const feedback = await submit(submitter, 'no note text');

      await addNote(feedback.id).expect(201);

      const page = await inbox().expect(200);
      expect(JSON.stringify(page.body)).not.toContain('looked at this');
    });

    it('sends the reply email after the commit when email is on', async () => {
      await setFeedbackPreference(true, true);
      const feedback = await submit(submitter, 'email');

      await addNote(feedback.id).expect(201);

      await waitForEmail(submitter.email);
      expect(notificationMock.send).toHaveBeenCalledWith(
        submitter.email,
        'feedback-replied',
        {},
      );
    });

    it('creates no notification for anonymous feedback, and the note still saves', async () => {
      const feedback = await submit(null, 'anonymous reply');

      await addNote(feedback.id).expect(201);

      expect(
        await prisma.feedbackNote.count({ where: { feedbackId: feedback.id } }),
      ).toBe(1);
      expect(await notificationsAbout(feedback.id)).toBe(0);
      expect(notificationMock.send).not.toHaveBeenCalled();
    });

    it('creates no notification when the submitter replies to their own feedback', async () => {
      const own = {
        accessToken: adminToken,
        id: adminId,
        email: `${marker}-admin@test.com`,
      } satisfies RegisteredUser;
      const feedback = await submit(own, 'self reply');
      expect(feedback.submittedById).toBe(adminId);

      await addNote(feedback.id).expect(201);

      expect(
        await prisma.feedbackNote.count({ where: { feedbackId: feedback.id } }),
      ).toBe(1);
      expect(await notificationsAbout(feedback.id)).toBe(0);
    });

    it('saves the note and leaves the inbox empty when in-app is off', async () => {
      await setFeedbackPreference(false, false);
      const feedback = await submit(submitter, 'in-app off');

      await addNote(feedback.id).expect(201);

      expect(
        await prisma.feedbackNote.count({ where: { feedbackId: feedback.id } }),
      ).toBe(1);
      expect((await inbox().expect(200)).body).toEqual({
        items: [],
        nextCursor: null,
      });
      expect((await unreadCount().expect(200)).body).toEqual({ count: 0 });
      expect(notificationMock.send).not.toHaveBeenCalled();
    });

    it('returns 404 and writes nothing for feedback that does not exist', async () => {
      const missing = '00000000-0000-4000-8000-000000000000';

      await addNote(missing).expect(404);

      expect(await notificationsAbout(missing)).toBe(0);
    });
  });

  describe('rollback', () => {
    it('leaves no note and no notification when the write fails after the notification row', async () => {
      const feedback = await submit(submitter, 'rollback');
      const real = dispatcher.feedbackReplied.bind(dispatcher);
      const spy = jest
        .spyOn(dispatcher, 'feedbackReplied')
        .mockImplementationOnce(async (input, tx) => {
          await real(input, tx);
          throw new Error('failed after the notification was written');
        });

      try {
        await addNote(feedback.id).expect(500);
      } finally {
        spy.mockRestore();
      }

      expect(
        await prisma.feedbackNote.count({ where: { feedbackId: feedback.id } }),
      ).toBe(0);
      expect(await notificationsAbout(feedback.id)).toBe(0);
      expect(notificationMock.send).not.toHaveBeenCalled();

      // Nothing was left behind, so a retry notifies once
      await addNote(feedback.id).expect(201);
      expect(await notificationsAbout(feedback.id)).toBe(1);
    });
  });
});
