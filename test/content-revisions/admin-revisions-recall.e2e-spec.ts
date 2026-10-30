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
  ReviewDecision,
  RevisionStatus,
  Role,
} from '../../src/generated/prisma/client';
import type { CareerSnapshot } from '../../src/catalog/content-revisions';
import {
  notificationMock,
  registerAndVerify,
  wireNotificationMock,
} from '../utils/auth';

type RecallBody = {
  id: string;
  careerId: string;
  status: RevisionStatus;
  baseVersion: number;
};

type ErrorBody = { error: string; code?: string };

describe('Admin revision recall (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let apiPrefix: string;

  const users = {} as Record<string, { id: string; token: string }>;
  let fieldId: string;
  const timestamp = Date.now();
  const marker = `e2e-revision-recall-${timestamp}`;
  const password = 'Password123!';

  const snapshot = (title: string): CareerSnapshot => ({
    schemaVersion: 1,
    career: {
      title,
      slug: 'devops-engineer',
      description: 'Automates delivery.',
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

  const recall = (revisionId: string, token: string | null) => {
    const req = request(app.getHttpServer()).post(
      `${apiPrefix}/admin/revisions/${revisionId}/recall`,
    );
    return token ? req.set('Authorization', `Bearer ${token}`) : req;
  };

  const makeRevision = async (label: string, status: RevisionStatus) => {
    const career = await prisma.career.create({
      data: {
        slug: `${marker}-${label}`,
        title: `Recall ${label} ${timestamp}`,
        description: 'd',
        fieldId,
        status: CareerStatus.PUBLISHED,
        version: 2,
      },
    });
    const revision = await prisma.contentRevision.create({
      data: {
        careerId: career.id,
        baseVersion: 2,
        snapshot: snapshot('Proposed'),
        status,
        createdById: users.creator.id,
      },
    });
    return { careerId: career.id, revisionId: revision.id };
  };

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

    const roles: [string, Role][] = [
      ['creator', Role.EDITOR],
      ['other-editor', Role.EDITOR],
      ['reviewer', Role.REVIEWER],
      ['admin', Role.ADMIN],
      ['user', Role.USER],
    ];
    for (const [label, role] of roles) {
      const email = `${marker}-${label}@test.com`;
      const registered = await registerAndVerify(app, apiPrefix, {
        email,
        password,
      });
      await prisma.user.update({
        where: { id: registered.id },
        data: { role },
      });
      const login = await request(app.getHttpServer())
        .post(`${apiPrefix}/auth/login`)
        .send({ email, password })
        .expect(200);
      users[label] = {
        id: registered.id,
        token: (login.body as { accessToken: string }).accessToken,
      };
    }

    const field = await prisma.field.create({
      data: { name: `Recall Field ${timestamp}`, slug: `${marker}-field` },
    });
    fieldId = field.id;
  });

  afterAll(async () => {
    await prisma.career.deleteMany({ where: { slug: { startsWith: marker } } });
    await prisma.field.deleteMany({ where: { id: fieldId } });
    await prisma.user.deleteMany({
      where: { id: { in: Object.values(users).map(({ id }) => id) } },
    });
    await app.close();
  });

  it('returns a submitted revision to DRAFT, and the creator can save again', async () => {
    const { careerId, revisionId } = await makeRevision(
      'happy',
      RevisionStatus.IN_REVIEW,
    );

    const response = await recall(revisionId, users.creator.token).expect(200);

    expect(response.body).toEqual(
      expect.objectContaining({
        id: revisionId,
        careerId,
        status: RevisionStatus.DRAFT,
        baseVersion: 2,
      }),
    );
    expect(await statusOf(revisionId)).toBe(RevisionStatus.DRAFT);

    const saved = await request(app.getHttpServer())
      .put(`${apiPrefix}/admin/careers/${careerId}/revision`)
      .set('Authorization', `Bearer ${users.creator.token}`)
      .send(snapshot('Fixed after recall'))
      .expect(200);
    expect(saved.body).toEqual(
      expect.objectContaining({ id: revisionId, created: false }),
    );
  });

  it('keeps past reviews of the revision', async () => {
    const { revisionId } = await makeRevision(
      'reviews',
      RevisionStatus.IN_REVIEW,
    );
    await prisma.review.create({
      data: {
        revisionId,
        reviewerId: users.reviewer.id,
        decision: ReviewDecision.REJECTED,
        note: 'Earlier round',
      },
    });

    await recall(revisionId, users.creator.token).expect(200);

    expect(await prisma.review.count({ where: { revisionId } })).toBe(1);
  });

  it("lets an ADMIN recall someone else's revision", async () => {
    const { revisionId } = await makeRevision(
      'admin',
      RevisionStatus.IN_REVIEW,
    );

    await recall(revisionId, users.admin.token).expect(200);

    expect(await statusOf(revisionId)).toBe(RevisionStatus.DRAFT);
  });

  it.each(['other-editor', 'reviewer'])(
    'returns 403 NOT_REVISION_CREATOR for a non-creator %s',
    async (label) => {
      const { revisionId } = await makeRevision(
        `forbidden-${label}`,
        RevisionStatus.IN_REVIEW,
      );

      const response = await recall(revisionId, users[label].token).expect(403);

      expect(response.body).toEqual(
        expect.objectContaining({
          error: 'FORBIDDEN',
          code: 'NOT_REVISION_CREATOR',
        }),
      );
      expect(await statusOf(revisionId)).toBe(RevisionStatus.IN_REVIEW);
    },
  );

  it.each([RevisionStatus.DRAFT, RevisionStatus.APPROVED])(
    'returns 409 INVALID_REVISION_STATE for a %s revision',
    async (status) => {
      const { revisionId } = await makeRevision(
        `state-${status.toLowerCase()}`,
        status,
      );

      const response = await recall(revisionId, users.creator.token).expect(
        409,
      );

      expect(response.body).toEqual(
        expect.objectContaining({
          error: 'CONFLICT',
          code: 'INVALID_REVISION_STATE',
        }),
      );
      expect(await statusOf(revisionId)).toBe(status);
    },
  );

  it('lets exactly one of two concurrent recalls succeed', async () => {
    const { revisionId } = await makeRevision('race', RevisionStatus.IN_REVIEW);

    const responses = await Promise.all([
      recall(revisionId, users.creator.token),
      recall(revisionId, users.creator.token),
    ]);

    expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
    const conflict = responses.find((r) => r.status === 409)!;
    expect((conflict.body as ErrorBody).code).toBe('INVALID_REVISION_STATE');
    expect(
      (responses.find((r) => r.status === 200)!.body as RecallBody).status,
    ).toBe(RevisionStatus.DRAFT);
  });

  it('returns 404 for an unknown revision', async () => {
    await recall(
      '00000000-0000-4000-8000-000000000000',
      users.creator.token,
    ).expect(404);
  });

  it('returns 400 BAD_REQUEST for a revisionId that is not a UUID', async () => {
    const response = await recall('not-a-uuid', users.creator.token).expect(
      400,
    );

    expect((response.body as ErrorBody).error).toBe('BAD_REQUEST');
  });

  it('returns 403 for a USER', async () => {
    const { revisionId } = await makeRevision(
      'user-role',
      RevisionStatus.IN_REVIEW,
    );

    await recall(revisionId, users.user.token).expect(403);
  });

  it('returns 401 without an access token', async () => {
    const { revisionId } = await makeRevision(
      'no-token',
      RevisionStatus.IN_REVIEW,
    );

    await recall(revisionId, null).expect(401);
  });
});
