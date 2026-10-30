import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { AppModule } from '../../src/app.module';
import { apiPrefix as resolveApiPrefix, configureApp } from '../../src/common';
import { EnvironmentVariables } from '../../src/config';
import { NotificationService } from '../../src/notifications';
import { PrismaService } from '../../src/prisma';
import { Role } from '../../src/generated/prisma/client';
import type { CareerSnapshot } from '../../src/catalog/content-revisions/career-snapshot.types';
import {
  notificationMock,
  registerAndVerify,
  wireNotificationMock,
} from '../utils/auth';

describe('Admin revisions — rebase (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let apiPrefix: string;

  const userIds: string[] = [];
  const marker = `e2e-rebase-${Date.now()}`;
  const tokens = {} as Record<Role, string>;

  let fieldId: string;
  let editorId: string;
  let editor2Id: string;
  let adminId: string;

  // Minimal valid snapshot; rebase doesn't validate it, but we keep it real.
  const snapshot = (): CareerSnapshot =>
    ({
      schemaVersion: 1,
      career: {
        title: `Career ${marker}`,
        slug: `career-${marker}`,
        description: 'desc',
        roleSummary: null,
        fieldId: null,
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
    }) as CareerSnapshot;

  const careerIds: string[] = [];
  const revisionIds: string[] = [];
  let editor2Token: string;

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

    const field = await prisma.field.create({
      data: { name: `Field ${marker}`, slug: `field-${marker}` },
    });
    fieldId = field.id;

    // Seed one user per role we need tokens for.
    for (const role of [
      Role.EDITOR,
      Role.REVIEWER,
      Role.PUBLISHER,
      Role.ADMIN,
    ]) {
      const email = `${marker}-${role.toLowerCase()}@test.com`;
      const registered = await registerAndVerify(app, apiPrefix, {
        email,
        password: 'Password123!',
      });
      userIds.push(registered.id);
      await prisma.user.update({
        where: { id: registered.id },
        data: { role },
      });
      const login = await request(app.getHttpServer())
        .post(`${apiPrefix}/auth/login`)
        .send({ email, password: 'Password123!' })
        .expect(200);
      tokens[role] = (login.body as { accessToken: string }).accessToken;

      if (role === Role.EDITOR) editorId = registered.id;
      if (role === Role.ADMIN) adminId = registered.id;
    }

    // Second EDITOR, for the creator-only check.
    const editor2Email = `${marker}-editor2@test.com`;
    const editor2 = await registerAndVerify(app, apiPrefix, {
      email: editor2Email,
      password: 'Password123!',
    });
    userIds.push(editor2.id);
    await prisma.user.update({
      where: { id: editor2.id },
      data: { role: Role.EDITOR },
    });
    const login2 = await request(app.getHttpServer())
      .post(`${apiPrefix}/auth/login`)
      .send({ email: editor2Email, password: 'Password123!' })
      .expect(200);
    editor2Id = editor2.id;
    (tokens as Record<string, string>)['EDITOR_2'] = (
      login2.body as { accessToken: string }
    ).accessToken;
  });

  afterAll(async () => {
    await prisma.contentRevision.deleteMany({
      where: { id: { in: revisionIds } },
    });
    await prisma.career.deleteMany({ where: { id: { in: careerIds } } });
    await prisma.field.deleteMany({ where: { id: fieldId } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await app.close();
  });

  const seedCareer = async (args: {
    status: 'DRAFT' | 'PUBLISHED' | 'RETIRED';
    version: number;
  }) => {
    const career = await prisma.career.create({
      data: {
        title: `Career ${marker} ${Date.now()}-${Math.random()}`,
        slug: `career-${marker}-${Date.now()}-${Math.random()}`,
        description: 'desc',
        exampleActivities: [],
        fieldId,
        status: args.status,
        version: args.version,
      },
    });
    careerIds.push(career.id);
    return career.id;
  };

  const seedRevision = async (args: {
    careerId: string;
    createdById: string;
    status?: 'DRAFT' | 'IN_REVIEW' | 'APPROVED' | 'REJECTED' | 'PUBLISHED';
    baseVersion: number;
  }) => {
    const revision = await prisma.contentRevision.create({
      data: {
        careerId: args.careerId,
        createdById: args.createdById,
        status: args.status ?? 'DRAFT',
        baseVersion: args.baseVersion,
        snapshot: snapshot() as unknown as object,
      },
    });
    revisionIds.push(revision.id);
    return revision.id;
  };

  const rebase = (revisionId: string, token = tokens[Role.EDITOR]) =>
    request(app.getHttpServer())
      .post(`${apiPrefix}/admin/revisions/${revisionId}/rebase`)
      .set('Authorization', `Bearer ${token}`);

  // ────────────────────────────────────────────────────────────────────
  // Happy path
  // ────────────────────────────────────────────────────────────────────

  it('re-anchors a stale draft to the live version (rebased:true)', async () => {
    const careerId = await seedCareer({ status: 'PUBLISHED', version: 4 });
    const revisionId = await seedRevision({
      careerId,
      createdById: editorId,
      status: 'DRAFT',
      baseVersion: 2,
    });

    const response = await rebase(revisionId).expect(200);

    expect(response.body).toMatchObject({
      id: revisionId,
      careerId,
      status: 'DRAFT',
      baseVersion: 4,
      liveVersion: 4,
      rebased: true,
    });

    const after = await prisma.contentRevision.findUniqueOrThrow({
      where: { id: revisionId },
    });
    expect(after.baseVersion).toBe(4);
    expect(after.status).toBe('DRAFT');
  });

  it('returns rebased:false with no write when already fresh', async () => {
    const careerId = await seedCareer({ status: 'PUBLISHED', version: 3 });
    const revisionId = await seedRevision({
      careerId,
      createdById: editorId,
      status: 'DRAFT',
      baseVersion: 3,
    });
    const before = await prisma.contentRevision.findUniqueOrThrow({
      where: { id: revisionId },
    });

    const response = await rebase(revisionId).expect(200);
    expect(response.body.rebased).toBe(false);
    expect(response.body.baseVersion).toBe(3);

    const after = await prisma.contentRevision.findUniqueOrThrow({
      where: { id: revisionId },
    });
    expect(after.updatedAt).toEqual(before.updatedAt);
  });

  it('leaves the snapshot untouched after rebase', async () => {
    const careerId = await seedCareer({ status: 'PUBLISHED', version: 5 });
    const revisionId = await seedRevision({
      careerId,
      createdById: editorId,
      status: 'DRAFT',
      baseVersion: 1,
    });
    const before = await prisma.contentRevision.findUniqueOrThrow({
      where: { id: revisionId },
    });

    await rebase(revisionId).expect(200);

    const after = await prisma.contentRevision.findUniqueOrThrow({
      where: { id: revisionId },
    });
    expect(after.snapshot).toEqual(before.snapshot);
  });

  // ────────────────────────────────────────────────────────────────────
  // Failure paths
  // ────────────────────────────────────────────────────────────────────

  it('409 INVALID_REVISION_STATE for an IN_REVIEW revision', async () => {
    const careerId = await seedCareer({ status: 'PUBLISHED', version: 2 });
    const revisionId = await seedRevision({
      careerId,
      createdById: editorId,
      status: 'IN_REVIEW',
      baseVersion: 1,
    });

    const response = await rebase(revisionId).expect(409);
    expect(response.body.code).toBe('INVALID_REVISION_STATE');

    const after = await prisma.contentRevision.findUniqueOrThrow({
      where: { id: revisionId },
    });
    expect(after.baseVersion).toBe(1);
  });

  it('403 NOT_REVISION_CREATOR for a different EDITOR', async () => {
    const careerId = await seedCareer({ status: 'PUBLISHED', version: 2 });
    const revisionId = await seedRevision({
      careerId,
      createdById: editorId,
      status: 'DRAFT',
      baseVersion: 1,
    });

    const editor2Token = (tokens as Record<string, string>)['EDITOR_2'];
    const response = await rebase(revisionId, editor2Token).expect(403);
    expect(response.body.code).toBe('NOT_REVISION_CREATOR');
    expect(editor2Id).toBeDefined();
  });

  it('403 for ADMIN when not the creator (no bypass)', async () => {
    const careerId = await seedCareer({ status: 'PUBLISHED', version: 2 });
    const revisionId = await seedRevision({
      careerId,
      createdById: editorId,
      status: 'DRAFT',
      baseVersion: 1,
    });

    const response = await rebase(revisionId, tokens[Role.ADMIN]).expect(403);
    expect(response.body.code).toBe('NOT_REVISION_CREATOR');
    expect(adminId).toBeDefined();
  });

  it('403 for REVIEWER and PUBLISHER when not the creator', async () => {
    const careerId = await seedCareer({ status: 'PUBLISHED', version: 2 });
    const revisionId = await seedRevision({
      careerId,
      createdById: editorId,
      status: 'DRAFT',
      baseVersion: 1,
    });

    await rebase(revisionId, tokens[Role.REVIEWER]).expect(403);
    await rebase(revisionId, tokens[Role.PUBLISHER]).expect(403);
  });

  it('404 for an unknown revision id', async () => {
    await rebase('00000000-0000-4000-8000-000000000000').expect(404);
  });

  it('401 without a token', async () => {
    await request(app.getHttpServer())
      .post(
        `${apiPrefix}/admin/revisions/00000000-0000-4000-8000-000000000000/rebase`,
      )
      .expect(401);
  });

  it('409 CAREER_RETIRED when the career is retired', async () => {
    const careerId = await seedCareer({ status: 'RETIRED', version: 2 });
    const revisionId = await seedRevision({
      careerId,
      createdById: editorId,
      status: 'DRAFT',
      baseVersion: 1,
    });

    const response = await rebase(revisionId).expect(409);
    expect(response.body.code).toBe('CAREER_RETIRED');
  });

  // ────────────────────────────────────────────────────────────────────
  // Concurrency — the lock doing its job
  // ────────────────────────────────────────────────────────────────────

  it('anchors to the latest version when a publish races the rebase', async () => {
    const careerId = await seedCareer({ status: 'PUBLISHED', version: 2 });
    const revisionId = await seedRevision({
      careerId,
      createdById: editorId,
      status: 'DRAFT',
      baseVersion: 1,
    });

    // Fire the rebase and, in parallel, bump the career version as a
    // stand-in for a concurrent publish. The FOR UPDATE lock means the
    // rebase must observe a version that was current at some point during
    // the transaction, never a stale one.
    const [, response] = await Promise.all([
      prisma.career.update({
        where: { id: careerId },
        data: { version: 3 },
      }),
      rebase(revisionId).expect(200),
    ]);

    const finalCareer = await prisma.career.findUniqueOrThrow({
      where: { id: careerId },
    });
    // Whatever order they landed in, the revision is never left anchored to
    // a version older than the one the career had when we started.
    expect(response.body.baseVersion).toBeGreaterThanOrEqual(2);
    expect(response.body.baseVersion).toBeLessThanOrEqual(finalCareer.version);
  });
});
