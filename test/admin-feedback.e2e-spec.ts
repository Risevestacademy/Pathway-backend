import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { INestApplication, Logger } from '@nestjs/common';
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

interface ListItem {
  id: string;
  status: string;
  [key: string]: unknown;
}

describe('Admin feedback (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let apiPrefix: string;

  const userIds: string[] = [];
  const tokens = {} as Record<Role, string>;
  let adminToken: string;
  let fieldId: string;
  let careerId: string;
  let reportsCareerId: string;
  const feedbackIds: Record<string, string> = {};

  const password = 'Password123!';
  const timestamp = Date.now();
  const marker = `e2e-admin-feedback-${timestamp}`;
  const orphanTargetId = '00000000-0000-4000-8000-000000000001';
  const longDescription = `${marker} ${'word '.repeat(60)}`.trim();

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

  const idsOf = (body: { items: ListItem[] }) =>
    body.items.map((item) => item.id);

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

    const reportsCareer = await prisma.career.create({
      data: {
        slug: `${marker}-reports-career`,
        title: `Admin Feedback Reports Career ${timestamp}`,
        description: 'd',
        roleSummary: 'r',
        exampleActivities: [],
        fieldId,
      },
    });
    reportsCareerId = reportsCareer.id;

    const reports = [
      {
        label: 'careerReport',
        data: {
          category: 'BROKEN_LINK' as const,
          description: longDescription,
          targetType: 'CAREER' as const,
          targetId: reportsCareerId,
          userEmail: 'reporter@example.com',
          platform: 'WEB' as const,
          createdAt: new Date(Date.UTC(2026, 9, 25)),
        },
      },
      {
        label: 'orphanReport',
        data: {
          category: 'INCORRECT_CONTENT' as const,
          description: `${marker} orphan`,
          targetType: 'RESOURCE' as const,
          targetId: orphanTargetId,
          createdAt: new Date(Date.UTC(2026, 9, 24)),
        },
      },
      {
        label: 'generalReport',
        data: {
          category: 'OTHER' as const,
          description: `${marker} general`,
          targetType: 'OTHER' as const,
          createdAt: new Date(Date.UTC(2026, 9, 23)),
        },
      },
    ];
    for (const { label, data } of reports) {
      const created = await prisma.contentFeedback.create({
        data: { ...data, careerId: reportsCareerId },
      });
      feedbackIds[label] = created.id;
    }
  });

  afterAll(async () => {
    await prisma.contentFeedback.deleteMany({
      where: {
        OR: [
          { careerId: { in: [careerId, reportsCareerId] } },
          { description: { startsWith: marker } },
        ],
      },
    });
    await prisma.career.deleteMany({
      where: { id: { in: [careerId, reportsCareerId] } },
    });
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

    it.each([Role.USER, Role.EDITOR])(
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

    it.each([Role.REVIEWER, Role.PUBLISHER])(
      'lets a %s list feedback',
      async (role) => {
        await list({ careerId }, tokens[role]).expect(200);
      },
    );

    it('lets a REVIEWER update a status', async () => {
      const response = await patchStatus(
        feedbackIds.middle,
        { status: 'RESOLVED' },
        tokens[Role.REVIEWER],
      ).expect(200);

      expect(response.body.status).toBe('RESOLVED');
    });
  });

  describe('GET /admin/feedback', () => {
    it('lists feedback for a career newest first with the total', async () => {
      const response = await list({ careerId }).expect(200);

      expect(response.body).toMatchObject({ total: 3, page: 1, limit: 20 });
      expect(idsOf(response.body)).toEqual([
        feedbackIds.newest,
        feedbackIds.middle,
        feedbackIds.oldest,
      ]);
    });

    it('filters by status', async () => {
      const response = await list({ careerId, status: 'NEW' }).expect(200);

      expect(response.body.total).toBe(2);
      expect(
        (response.body.items as ListItem[]).every(
          (item) => item.status === 'NEW',
        ),
      ).toBe(true);
    });

    it('filters by category', async () => {
      const response = await list({
        careerId: reportsCareerId,
        category: 'BROKEN_LINK',
      }).expect(200);

      expect(idsOf(response.body)).toEqual([feedbackIds.careerReport]);
    });

    it.each([
      ['RESOURCE', 'orphanReport'],
      ['OTHER', 'generalReport'],
      ['CAREER', 'careerReport'],
    ])('filters by targetType %s', async (targetType, label) => {
      const response = await list({
        careerId: reportsCareerId,
        targetType,
      }).expect(200);

      expect(idsOf(response.body)).toEqual([feedbackIds[label]]);
    });

    it('combines the status, category and targetType filters', async () => {
      const response = await list({
        careerId: reportsCareerId,
        status: 'NEW',
        category: 'BROKEN_LINK',
        targetType: 'RESOURCE',
      }).expect(200);

      expect(response.body).toMatchObject({ total: 0, items: [] });
    });

    it('paginates with page and limit', async () => {
      const response = await list({ careerId, page: 2, limit: 2 }).expect(200);

      expect(response.body).toMatchObject({ total: 3, page: 2, limit: 2 });
      expect(idsOf(response.body)).toEqual([feedbackIds.oldest]);
    });

    it('returns the fields the Reports table needs', async () => {
      const response = await list({
        careerId: reportsCareerId,
        category: 'BROKEN_LINK',
      }).expect(200);
      const [item] = response.body.items as ListItem[];

      expect(item).toEqual({
        id: feedbackIds.careerReport,
        category: 'BROKEN_LINK',
        section: 'GENERAL',
        careerId: reportsCareerId,
        status: 'NEW',
        resolution: null,
        description: longDescription,
        snippet: expect.stringMatching(/…$/),
        target: {
          type: 'CAREER',
          id: reportsCareerId,
          label: `Admin Feedback Reports Career ${timestamp}`,
        },
        userEmail: 'reporter@example.com',
        platform: 'WEB',
        createdAt: '2026-10-25T00:00:00.000Z',
        updatedAt: expect.any(String),
      });
      expect((item.snippet as string).length).toBeLessThan(
        longDescription.length,
      );
      expect(item).not.toHaveProperty('notes');
    });

    it('gives a null label for a target that no longer exists', async () => {
      const response = await list({
        careerId: reportsCareerId,
        targetType: 'RESOURCE',
      }).expect(200);

      expect((response.body.items as ListItem[])[0].target).toEqual({
        type: 'RESOURCE',
        id: orphanTargetId,
        label: null,
      });
    });

    it('gives an OTHER report no target id and no label', async () => {
      const response = await list({
        careerId: reportsCareerId,
        targetType: 'OTHER',
      }).expect(200);

      expect((response.body.items as ListItem[])[0].target).toEqual({
        type: 'OTHER',
        id: null,
        label: null,
      });
    });

    it.each([
      ['an unknown status', { status: 'OPEN' }],
      ['an unknown category', { category: 'BUG' }],
      ['an unknown targetType', { targetType: 'TOPIC' }],
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

  describe('triage and notes', () => {
    const triageIds: Record<string, string> = {};

    const patchFeedback = (id: string, body: unknown, token = adminToken) =>
      request(app.getHttpServer())
        .patch(`${apiPrefix}/admin/feedback/${id}`)
        .set('Authorization', `Bearer ${token}`)
        .send(body as object);

    const addNote = (id: string, body: unknown, token = adminToken) =>
      request(app.getHttpServer())
        .post(`${apiPrefix}/admin/feedback/${id}/notes`)
        .set('Authorization', `Bearer ${token}`)
        .send(body as object);

    const getDetail = (id: string, token = adminToken) =>
      request(app.getHttpServer())
        .get(`${apiPrefix}/admin/feedback/${id}`)
        .set('Authorization', `Bearer ${token}`);

    beforeAll(async () => {
      for (const label of ['resolve', 'reopen', 'notes', 'public']) {
        const created = await prisma.contentFeedback.create({
          data: {
            category: 'OTHER',
            description: `${marker} triage ${label}`,
            careerId,
            targetType: 'CAREER',
            targetId: careerId,
          },
        });
        triageIds[label] = created.id;
      }
    });

    describe('PATCH /admin/feedback/:id', () => {
      it('sets status and resolution together and returns the detail', async () => {
        const response = await patchFeedback(triageIds.resolve, {
          status: 'RESOLVED',
          resolution: 'FIXED',
        }).expect(200);

        expect(response.body).toMatchObject({
          id: triageIds.resolve,
          status: 'RESOLVED',
          resolution: 'FIXED',
          notes: [],
          target: { type: 'CAREER', id: careerId },
        });
        const saved = await prisma.contentFeedback.findUniqueOrThrow({
          where: { id: triageIds.resolve },
        });
        expect(saved).toMatchObject({
          status: 'RESOLVED',
          resolution: 'FIXED',
        });
      });

      it('clears the resolution when the report is reopened', async () => {
        await patchFeedback(triageIds.reopen, {
          status: 'RESOLVED',
          resolution: 'NOT_AN_ISSUE',
        }).expect(200);

        const response = await patchFeedback(triageIds.reopen, {
          status: 'UNDER_REVIEW',
        }).expect(200);

        expect(response.body).toMatchObject({
          status: 'UNDER_REVIEW',
          resolution: null,
        });
        const saved = await prisma.contentFeedback.findUniqueOrThrow({
          where: { id: triageIds.reopen },
        });
        expect(saved.resolution).toBeNull();
      });

      it('returns 400 for RESOLVED without a resolution and changes nothing', async () => {
        const response = await patchFeedback(triageIds.notes, {
          status: 'RESOLVED',
        }).expect(400);

        expect(response.body).toMatchObject({
          error: 'RESOLUTION_REQUIRED',
        });
        const saved = await prisma.contentFeedback.findUniqueOrThrow({
          where: { id: triageIds.notes },
        });
        expect(saved).toMatchObject({ status: 'NEW', resolution: null });
      });

      it('returns 400 for a resolution on a status other than RESOLVED', async () => {
        const response = await patchFeedback(triageIds.notes, {
          status: 'UNDER_REVIEW',
          resolution: 'FIXED',
        }).expect(400);

        expect(response.body.error).toBe('RESOLUTION_NOT_ALLOWED');
      });

      it.each([
        ['an unknown status', { status: 'CLOSED' }],
        ['a missing status', { resolution: 'FIXED' }],
        ['an unknown resolution', { status: 'RESOLVED', resolution: 'DONE' }],
      ])('returns 400 for %s', async (_label, body) => {
        const response = await patchFeedback(triageIds.notes, body).expect(400);

        expect(response.body.error).toBe('VALIDATION_ERROR');
      });

      it('returns 404 for feedback that does not exist', async () => {
        await patchFeedback('00000000-0000-4000-8000-000000000000', {
          status: 'NEW',
        }).expect(404);
      });

      it('returns 400 for an id that is not a UUID', async () => {
        await patchFeedback('feedback-1', { status: 'NEW' }).expect(400);
      });

      it.each([Role.USER, Role.EDITOR])('returns 403 to %s', async (role) => {
        await patchFeedback(
          triageIds.notes,
          { status: 'UNDER_REVIEW' },
          tokens[role],
        ).expect(403);
      });

      it('returns 401 without an access token', async () => {
        await request(app.getHttpServer())
          .patch(`${apiPrefix}/admin/feedback/${triageIds.notes}`)
          .send({ status: 'NEW' })
          .expect(401);
      });
    });

    describe('POST /admin/feedback/:id/notes', () => {
      it('adds a note with the acting admin as author', async () => {
        const response = await addNote(triageIds.notes, {
          body: '  Checked with the content team.  ',
        }).expect(201);

        expect(response.body).toMatchObject({
          feedbackId: triageIds.notes,
          authorId: userIds[Object.values(Role).indexOf(Role.ADMIN)],
          body: 'Checked with the content team.',
        });
        expect(
          await prisma.feedbackNote.count({
            where: { feedbackId: triageIds.notes },
          }),
        ).toBe(1);
      });

      it('lets a REVIEWER add a note', async () => {
        await addNote(
          triageIds.notes,
          { body: 'Second look from a reviewer.' },
          tokens[Role.REVIEWER],
        ).expect(201);
      });

      it('writes the note body to no log line', async () => {
        const spy = jest
          .spyOn(Logger.prototype, 'log')
          .mockImplementation(() => undefined);
        let output: string;
        try {
          await addNote(triageIds.notes, {
            body: 'A private remark about the reporter.',
          }).expect(201);
          output = JSON.stringify(spy.mock.calls);
        } finally {
          spy.mockRestore();
        }

        expect(output).toContain('Feedback note added');
        expect(output).not.toContain('private remark');
      });

      it.each([
        ['an empty body', { body: '' }],
        ['a blank body', { body: '   ' }],
        ['a missing body', {}],
        ['a body over 2000 characters', { body: 'x'.repeat(2001) }],
      ])('returns 400 for %s', async (_label, body) => {
        const response = await addNote(triageIds.notes, body).expect(400);

        expect(response.body.error).toBe('VALIDATION_ERROR');
      });

      it('returns 404 for feedback that does not exist', async () => {
        await addNote('00000000-0000-4000-8000-000000000000', {
          body: 'hello',
        }).expect(404);
      });

      it.each([Role.USER, Role.EDITOR])('returns 403 to %s', async (role) => {
        await addNote(triageIds.notes, { body: 'hello' }, tokens[role]).expect(
          403,
        );
      });

      it('returns 401 without an access token', async () => {
        await request(app.getHttpServer())
          .post(`${apiPrefix}/admin/feedback/${triageIds.notes}/notes`)
          .send({ body: 'hello' })
          .expect(401);
      });
    });

    describe('GET /admin/feedback/:id', () => {
      it('returns the detail with the notes oldest first', async () => {
        const response = await getDetail(triageIds.notes).expect(200);

        const bodies = (response.body.notes as { body: string }[]).map(
          (note) => note.body,
        );
        expect(bodies.slice(0, 2)).toEqual([
          'Checked with the content team.',
          'Second look from a reviewer.',
        ]);
        expect(response.body).toMatchObject({
          id: triageIds.notes,
          description: `${marker} triage notes`,
          target: {
            type: 'CAREER',
            id: careerId,
            label: `Admin Feedback Career ${timestamp}`,
          },
        });
      });

      it('shows the notes in the PATCH response too', async () => {
        const response = await patchFeedback(triageIds.notes, {
          status: 'UNDER_REVIEW',
        }).expect(200);

        expect(
          (response.body.notes as { body: string }[]).map((n) => n.body),
        ).toContain('Checked with the content team.');
      });

      it('never puts notes in the list', async () => {
        const response = await list({ careerId }).expect(200);

        expect(JSON.stringify(response.body)).not.toContain('content team');
        for (const item of response.body.items as ListItem[]) {
          expect(item).not.toHaveProperty('notes');
        }
      });

      it('returns 404 for feedback that does not exist', async () => {
        await getDetail('00000000-0000-4000-8000-000000000000').expect(404);
      });

      it('returns 400 for an id that is not a UUID', async () => {
        await getDetail('feedback-1').expect(400);
      });

      it.each([Role.USER, Role.EDITOR])('returns 403 to %s', async (role) => {
        const response = await getDetail(triageIds.notes, tokens[role]).expect(
          403,
        );

        expect(JSON.stringify(response.body)).not.toContain('content team');
      });

      it('returns 401 without an access token', async () => {
        await request(app.getHttpServer())
          .get(`${apiPrefix}/admin/feedback/${triageIds.notes}`)
          .expect(401);
      });
    });

    describe('public responses', () => {
      it('never carry notes, even for a report that has some', async () => {
        await addNote(triageIds.public, {
          body: 'Internal only: reporter is a repeat submitter.',
        }).expect(201);

        const response = await request(app.getHttpServer())
          .post(`${apiPrefix}/feedback`)
          .send({
            category: 'OTHER',
            description: `${marker} public after note`,
          })
          .expect(201);

        expect(response.body).toEqual({ message: 'Feedback received' });
        expect(JSON.stringify(response.body)).not.toContain('Internal only');
      });

      it('give a signed-in USER no route to read a note', async () => {
        for (const path of [
          `/admin/feedback/${triageIds.public}`,
          '/admin/feedback',
        ]) {
          const response = await request(app.getHttpServer())
            .get(`${apiPrefix}${path}`)
            .set('Authorization', `Bearer ${tokens[Role.USER]}`)
            .expect(403);

          expect(JSON.stringify(response.body)).not.toContain('Internal only');
        }
      });
    });
  });
});
