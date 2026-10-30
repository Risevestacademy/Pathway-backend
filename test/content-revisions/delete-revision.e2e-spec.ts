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

describe('Delete draft revision (e2e)', () => {
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
  const marker = `e2e-delete-revision-${timestamp}`;

  // Each scenario gets its own career: only one revision per career can be
  // open (DRAFT or IN_REVIEW) at a time.
  const seedRevision = async (
    status: RevisionStatus,
    careerStatus: CareerStatus = CareerStatus.PUBLISHED,
  ) => {
    const key = `${marker}-${sequence++}`;
    const career = await prisma.career.create({
      data: {
        slug: key,
        title: key,
        description: 'd',
        exampleActivities: [],
        fieldId,
        status: careerStatus,
      },
    });
    careerIds.push(career.id);
    const revision = await prisma.contentRevision.create({
      data: {
        careerId: career.id,
        baseVersion: career.version,
        snapshot: { schemaVersion: 1 },
        status,
        createdById: ids[Role.EDITOR],
      },
    });
    return { careerId: career.id, revisionId: revision.id };
  };

  const remove = (revisionId: string, role: Role = Role.EDITOR) =>
    request(app.getHttpServer())
      .delete(`${apiPrefix}/admin/revisions/${revisionId}`)
      .set('Authorization', `Bearer ${tokens[role]}`);

  const revisionExists = async (revisionId: string) =>
    (await prisma.contentRevision.count({ where: { id: revisionId } })) === 1;

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

    for (const role of [Role.USER, Role.EDITOR]) {
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
        data: {
          name: `Delete Revision Field ${timestamp}`,
          slug: `${marker}-field`,
        },
      })
    ).id;
  });

  afterAll(async () => {
    if (careerIds.length)
      await prisma.career.deleteMany({ where: { id: { in: careerIds } } });
    if (fieldId) await prisma.field.deleteMany({ where: { id: fieldId } });
    if (userIds.length)
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await app?.close();
  });

  it('deletes a draft revision and keeps the career', async () => {
    const { careerId, revisionId } = await seedRevision(RevisionStatus.DRAFT);

    const response = await remove(revisionId).expect(200);

    expect(response.body).toEqual({ message: 'Draft revision deleted' });
    expect(await revisionExists(revisionId)).toBe(false);
    expect(await prisma.career.count({ where: { id: careerId } })).toBe(1);
  });

  it('keeps a never-published career when its draft revision is deleted', async () => {
    const { careerId, revisionId } = await seedRevision(
      RevisionStatus.DRAFT,
      CareerStatus.DRAFT,
    );

    await remove(revisionId).expect(200);

    const career = await prisma.career.findUniqueOrThrow({
      where: { id: careerId },
    });
    expect(career.status).toBe(CareerStatus.DRAFT);
    expect(career.publishedAt).toBeNull();
  });

  it.each([
    RevisionStatus.IN_REVIEW,
    RevisionStatus.APPROVED,
    RevisionStatus.REJECTED,
    RevisionStatus.PUBLISHED,
  ])('returns 409 INVALID_REVISION_STATE for a %s revision', async (status) => {
    const { revisionId } = await seedRevision(status);

    const response = await remove(revisionId).expect(409);

    expect(response.body).toMatchObject({ code: 'INVALID_REVISION_STATE' });
    expect(await revisionExists(revisionId)).toBe(true);
  });

  it('returns 403 to a USER and keeps the revision', async () => {
    const { revisionId } = await seedRevision(RevisionStatus.DRAFT);

    const response = await remove(revisionId, Role.USER).expect(403);

    expect(response.body.error).toBe('FORBIDDEN');
    expect(await revisionExists(revisionId)).toBe(true);
  });

  it('returns 401 without an access token', async () => {
    const { revisionId } = await seedRevision(RevisionStatus.DRAFT);

    await request(app.getHttpServer())
      .delete(`${apiPrefix}/admin/revisions/${revisionId}`)
      .expect(401);
  });

  it('returns 404 for a revision that does not exist', async () => {
    const response = await remove(
      '00000000-0000-4000-8000-000000000000',
    ).expect(404);

    expect(response.body.error).toBe('NOT_FOUND');
  });

  it('returns 400 for an id that is not a UUID', async () => {
    await remove('not-a-uuid').expect(400);
  });
});
