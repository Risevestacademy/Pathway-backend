import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { apiPrefix as resolveApiPrefix, configureApp } from '../src/common';
import { EnvironmentVariables } from '../src/config';
import { NotificationService } from '../src/notifications';
import { PrismaService } from '../src/prisma';
import { CareerStatus, Role } from '../src/generated/prisma/client';
import {
  notificationMock,
  registerAndVerify,
  wireNotificationMock,
} from './utils/auth';

describe('Admin career delete (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let apiPrefix: string;

  const userIds: string[] = [];
  const tokens = {} as Record<Role, string>;
  const careerIds: Record<string, string> = {};
  let fieldId: string;
  let skillId: string;
  let feedbackId: string;

  const password = 'Password123!';
  const timestamp = Date.now();
  const marker = `e2e-admin-career-delete-${timestamp}`;

  const remove = (id: string, token = tokens[Role.ADMIN]) =>
    request(app.getHttpServer())
      .delete(`${apiPrefix}/admin/careers/${id}`)
      .set('Authorization', `Bearer ${token}`);

  const makeCareer = async (
    label: string,
    data: { status: CareerStatus; publishedAt?: Date },
  ) => {
    const career = await prisma.career.create({
      data: {
        slug: `${marker}-${label}`,
        title: `Delete Career ${label} ${timestamp}`,
        description: 'd',
        roleSummary: 'r',
        exampleActivities: [],
        fieldId,
        ...data,
        pathway: {
          create: {
            title: `Pathway ${label}`,
            steps: {
              create: [1, 2].map((order) => ({
                title: `Step ${order}`,
                learningObjective: 'lo',
                expectedActivity: 'ea',
                order,
              })),
            },
          },
        },
      },
    });
    careerIds[label] = career.id;
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

    const field = await prisma.field.create({
      data: { name: `Delete Field ${timestamp}`, slug: `${marker}-field` },
    });
    fieldId = field.id;
    const skill = await prisma.skill.create({
      data: { name: `${marker}-skill` },
    });
    skillId = skill.id;

    await makeCareer('draft', { status: CareerStatus.DRAFT });
    await makeCareer('unpublished-again', {
      status: CareerStatus.DRAFT,
      publishedAt: new Date(),
    });
    await makeCareer('published', {
      status: CareerStatus.PUBLISHED,
      publishedAt: new Date(),
    });
    await makeCareer('retired', {
      status: CareerStatus.RETIRED,
      publishedAt: new Date(),
    });
    await makeCareer('saved', { status: CareerStatus.DRAFT });

    const draftId = careerIds.draft;
    const editorId = userIds[Object.values(Role).indexOf(Role.EDITOR)];
    const reviewerId = userIds[Object.values(Role).indexOf(Role.REVIEWER)];
    await prisma.careerSkill.create({ data: { careerId: draftId, skillId } });
    await prisma.outlookData.create({
      data: {
        careerId: draftId,
        type: 'SALARY',
        geography: 'Lagos, Nigeria',
        period: '2026',
      },
    });
    const revision = await prisma.contentRevision.create({
      data: {
        careerId: draftId,
        baseVersion: 1,
        snapshot: {},
        createdById: editorId,
      },
    });
    await prisma.review.create({
      data: {
        revisionId: revision.id,
        reviewerId,
        decision: 'REJECTED',
      },
    });
    const feedback = await prisma.contentFeedback.create({
      data: {
        category: 'OTHER',
        section: 'CAREER_DETAILS',
        description: `${marker} feedback`,
        careerId: draftId,
      },
    });
    feedbackId = feedback.id;

    await prisma.userPathway.create({
      data: {
        userId: userIds[Object.values(Role).indexOf(Role.USER)],
        careerId: careerIds.saved,
      },
    });
  });

  afterAll(async () => {
    await prisma.contentFeedback.deleteMany({ where: { id: feedbackId } });
    await prisma.career.deleteMany({
      where: { id: { in: Object.values(careerIds) } },
    });
    await prisma.skill.deleteMany({ where: { id: skillId } });
    await prisma.field.deleteMany({ where: { id: fieldId } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await app.close();
  });

  it('returns 401 without an access token', async () => {
    const response = await request(app.getHttpServer())
      .delete(`${apiPrefix}/admin/careers/${careerIds.draft}`)
      .expect(401);

    expect(response.body.error).toBe('UNAUTHORIZED');
  });

  it.each([Role.USER, Role.EDITOR, Role.REVIEWER, Role.PUBLISHER])(
    'returns 403 to %s and leaves the career',
    async (role) => {
      const response = await remove(careerIds.draft, tokens[role]).expect(403);

      expect(response.body.error).toBe('FORBIDDEN');
      await expect(
        prisma.career.count({ where: { id: careerIds.draft } }),
      ).resolves.toBe(1);
    },
  );

  it.each(['published', 'retired', 'unpublished-again', 'saved'])(
    'returns 409 for a %s career and changes nothing',
    async (label) => {
      const id = careerIds[label];
      const before = await prisma.career.findUniqueOrThrow({
        where: { id },
        include: { pathway: { include: { steps: true } }, userPathways: true },
      });

      const response = await remove(id).expect(409);

      expect(response.body).toMatchObject({
        error: 'CONFLICT',
        message:
          'Only a draft career that was never published or saved can be deleted',
      });
      const after = await prisma.career.findUniqueOrThrow({
        where: { id },
        include: { pathway: { include: { steps: true } }, userPathways: true },
      });
      expect(after).toEqual(before);
    },
  );

  it('returns 404 for a career that does not exist', async () => {
    const response = await remove(
      '00000000-0000-4000-8000-000000000000',
    ).expect(404);

    expect(response.body).toMatchObject({
      error: 'NOT_FOUND',
      message: 'Career not found',
    });
  });

  it('returns 400 for a non-UUID id', async () => {
    const response = await remove('career-1').expect(400);

    expect(response.body.error).toBe('BAD_REQUEST');
  });

  it('deletes a never-published draft with its pathway, skills, outlook and revisions', async () => {
    const id = careerIds.draft;

    const response = await remove(id).expect(200);

    expect(response.body).toEqual({ message: 'Career deleted' });
    await expect(prisma.career.count({ where: { id } })).resolves.toBe(0);
    await expect(
      prisma.pathway.count({ where: { careerId: id } }),
    ).resolves.toBe(0);
    await expect(
      prisma.careerSkill.count({ where: { careerId: id } }),
    ).resolves.toBe(0);
    await expect(
      prisma.outlookData.count({ where: { careerId: id } }),
    ).resolves.toBe(0);
    await expect(
      prisma.contentRevision.count({ where: { careerId: id } }),
    ).resolves.toBe(0);
    await expect(
      prisma.review.count({ where: { revision: { careerId: id } } }),
    ).resolves.toBe(0);
    await expect(prisma.skill.count({ where: { id: skillId } })).resolves.toBe(
      1,
    );
    const feedback = await prisma.contentFeedback.findUniqueOrThrow({
      where: { id: feedbackId },
    });
    expect(feedback.careerId).toBeNull();

    await remove(id).expect(404);
  });
});
