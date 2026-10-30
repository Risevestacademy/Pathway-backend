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
import {
  notificationMock,
  registerAndVerify,
  wireNotificationMock,
} from '../utils/auth';

describe('Review revision (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let apiPrefix: string;

  const userIds: string[] = [];
  const ids = {} as Record<Role, string>;
  const tokens = {} as Record<Role, string>;
  const careerIds: string[] = [];
  let fieldId: string;
  let sequence = 0;

  const password = 'Password123!';
  const timestamp = Date.now();
  const marker = `e2e-review-${timestamp}`;
  const LIVE_VERSION = 3;

  const seedRevision = async (
    createdBy: Role,
    options: { baseVersion?: number; status?: RevisionStatus } = {},
  ) => {
    const key = `${marker}-${sequence++}`;
    const career = await prisma.career.create({
      data: {
        slug: key,
        title: key,
        description: 'd',
        exampleActivities: [],
        fieldId,
        status: CareerStatus.PUBLISHED,
        version: LIVE_VERSION,
      },
    });
    careerIds.push(career.id);
    const revision = await prisma.contentRevision.create({
      data: {
        careerId: career.id,
        baseVersion: options.baseVersion ?? LIVE_VERSION,
        snapshot: { schemaVersion: 1 },
        status: options.status ?? RevisionStatus.IN_REVIEW,
        createdById: ids[createdBy],
      },
    });
    return { careerId: career.id, revisionId: revision.id };
  };

  const review = (
    revisionId: string,
    body: unknown,
    role: Role = Role.REVIEWER,
  ) =>
    request(app.getHttpServer())
      .post(`${apiPrefix}/admin/revisions/${revisionId}/review`)
      .set('Authorization', `Bearer ${tokens[role]}`)
      .send(body as object);

  const reviewCount = (revisionId: string) =>
    prisma.review.count({ where: { revisionId } });

  const statusOf = async (revisionId: string) =>
    (
      await prisma.contentRevision.findUniqueOrThrow({
        where: { id: revisionId },
      })
    ).status;

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

    for (const role of [Role.USER, Role.EDITOR, Role.REVIEWER, Role.ADMIN]) {
      const email = `${marker}-${role.toLowerCase()}@test.com`;
      const registered = await registerAndVerify(app, apiPrefix, {
        email,
        password,
      });
      userIds.push(registered.id);
      ids[role] = registered.id;
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
        data: { name: `Review Field ${timestamp}`, slug: `${marker}-field` },
      })
    ).id;
  });

  afterAll(async () => {
    // Careers first: revisions and reviews cascade, and both point at users.
    await prisma.career.deleteMany({ where: { id: { in: careerIds } } });
    await prisma.field.deleteMany({ where: { id: fieldId } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await app.close();
  });

  describe('authorization', () => {
    it('returns 401 without an access token', async () => {
      const { revisionId } = await seedRevision(Role.EDITOR);

      await request(app.getHttpServer())
        .post(`${apiPrefix}/admin/revisions/${revisionId}/review`)
        .send({ decision: 'APPROVED' })
        .expect(401);
    });

    it.each([Role.USER, Role.EDITOR])('returns 403 to %s', async (role) => {
      const { revisionId } = await seedRevision(Role.EDITOR);

      const response = await review(
        revisionId,
        { decision: 'APPROVED' },
        role,
      ).expect(403);

      expect(response.body.error).toBe('FORBIDDEN');
      expect(await statusOf(revisionId)).toBe(RevisionStatus.IN_REVIEW);
    });
  });

  describe('deciding', () => {
    it('approves a fresh revision, records the review and publishes nothing', async () => {
      const { careerId, revisionId } = await seedRevision(Role.EDITOR);

      const response = await review(revisionId, {
        decision: 'APPROVED',
        note: 'Looks good',
      }).expect(201);

      expect(response.body).toMatchObject({
        revisionId,
        decision: 'APPROVED',
        note: 'Looks good',
        revisionStatus: 'APPROVED',
      });

      const reviews = await prisma.review.findMany({ where: { revisionId } });
      expect(reviews).toHaveLength(1);
      expect(reviews[0]).toMatchObject({
        reviewerId: ids[Role.REVIEWER],
        decision: 'APPROVED',
        note: 'Looks good',
      });
      expect(await statusOf(revisionId)).toBe(RevisionStatus.APPROVED);

      const career = await prisma.career.findUniqueOrThrow({
        where: { id: careerId },
      });
      expect(career).toMatchObject({
        status: CareerStatus.PUBLISHED,
        version: LIVE_VERSION,
        publishedAt: null,
      });
    });

    it('rejects a revision and stores the note', async () => {
      const { revisionId } = await seedRevision(Role.EDITOR);

      const response = await review(revisionId, {
        decision: 'REJECTED',
        note: 'Needs sources',
      }).expect(201);

      expect(response.body.revisionStatus).toBe('REJECTED');
      expect(await statusOf(revisionId)).toBe(RevisionStatus.REJECTED);
    });

    it('stores a blank note as null', async () => {
      const { revisionId } = await seedRevision(Role.EDITOR);

      const response = await review(revisionId, {
        decision: 'APPROVED',
        note: '   ',
      }).expect(201);

      expect(response.body.note).toBeNull();
    });
  });

  describe('separation of duties', () => {
    it.each(['APPROVED', 'REJECTED'])(
      'returns 403 when a REVIEWER %s their own revision',
      async (decision) => {
        const { revisionId } = await seedRevision(Role.REVIEWER);

        const response = await review(revisionId, { decision }).expect(403);

        expect(response.body).toMatchObject({
          code: 'SELF_REVIEW_NOT_ALLOWED',
        });
        expect(await statusOf(revisionId)).toBe(RevisionStatus.IN_REVIEW);
        expect(await reviewCount(revisionId)).toBe(0);
      },
    );

    it('lets an ADMIN review their own revision', async () => {
      const { revisionId } = await seedRevision(Role.ADMIN);

      await review(revisionId, { decision: 'APPROVED' }, Role.ADMIN).expect(
        201,
      );

      expect(await statusOf(revisionId)).toBe(RevisionStatus.APPROVED);
    });
  });

  describe('stale revisions', () => {
    it('blocks approval with 409 REVISION_STALE and writes nothing', async () => {
      const { revisionId } = await seedRevision(Role.EDITOR, {
        baseVersion: LIVE_VERSION - 1,
      });

      const response = await review(revisionId, {
        decision: 'APPROVED',
      }).expect(409);

      expect(response.body).toMatchObject({ code: 'REVISION_STALE' });
      expect(await statusOf(revisionId)).toBe(RevisionStatus.IN_REVIEW);
      expect(await reviewCount(revisionId)).toBe(0);
    });

    it('still allows rejecting a stale revision', async () => {
      const { revisionId } = await seedRevision(Role.EDITOR, {
        baseVersion: LIVE_VERSION - 1,
      });

      await review(revisionId, { decision: 'REJECTED' }).expect(201);

      expect(await statusOf(revisionId)).toBe(RevisionStatus.REJECTED);
    });
  });

  describe('revision state', () => {
    it.each([
      RevisionStatus.DRAFT,
      RevisionStatus.APPROVED,
      RevisionStatus.REJECTED,
      RevisionStatus.PUBLISHED,
    ])(
      'returns 409 INVALID_REVISION_STATE for a %s revision',
      async (status) => {
        const { revisionId } = await seedRevision(Role.EDITOR, { status });

        const response = await review(revisionId, {
          decision: 'APPROVED',
        }).expect(409);

        expect(response.body).toMatchObject({ code: 'INVALID_REVISION_STATE' });
        expect(await reviewCount(revisionId)).toBe(0);
      },
    );

    it('cannot decide the same revision twice', async () => {
      const { revisionId } = await seedRevision(Role.EDITOR);

      await review(revisionId, { decision: 'APPROVED' }).expect(201);
      await review(revisionId, { decision: 'REJECTED' }).expect(409);

      expect(await reviewCount(revisionId)).toBe(1);
      expect(await statusOf(revisionId)).toBe(RevisionStatus.APPROVED);
    });
  });

  describe('validation', () => {
    it('returns 404 for a revision that does not exist', async () => {
      const response = await review('00000000-0000-4000-8000-000000000000', {
        decision: 'APPROVED',
      }).expect(404);

      expect(response.body.error).toBe('NOT_FOUND');
    });

    it('returns 400 for an id that is not a UUID', async () => {
      await review('not-a-uuid', { decision: 'APPROVED' }).expect(400);
    });

    it.each([
      ['an unknown decision', { decision: 'MAYBE' }],
      ['a missing decision', {}],
      [
        'a note over 2000 characters',
        { decision: 'APPROVED', note: 'x'.repeat(2001) },
      ],
    ])('returns 400 for %s', async (_label, body) => {
      const { revisionId } = await seedRevision(Role.EDITOR);

      const response = await review(revisionId, body).expect(400);

      expect(response.body.error).toBe('VALIDATION_ERROR');
      expect(await reviewCount(revisionId)).toBe(0);
    });
  });
});
