import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { apiPrefix as resolveApiPrefix, configureApp } from '../src/common';
import { EnvironmentVariables } from '../src/config';
import { NotificationService } from '../src/notifications';
import { PrismaService } from '../src/prisma';
import {
  CareerStatus,
  PathwayStepStatus,
  Role,
} from '../src/generated/prisma/client';
import {
  notificationMock,
  registerAndVerify,
  wireNotificationMock,
} from './utils/auth';

describe('Retire career (e2e)', () => {
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
  const marker = `e2e-retire-${timestamp}`;
  const LIVE_VERSION = 4;

  const seedCareer = async (status: CareerStatus, withLearner = false) => {
    const slug = `${marker}-${sequence++}`;
    const career = await prisma.career.create({
      data: {
        slug,
        title: slug,
        description: 'd',
        exampleActivities: [],
        fieldId,
        status,
        version: LIVE_VERSION,
        pathway: {
          create: {
            title: 'Path',
            steps: {
              create: [
                {
                  title: 'Step 1',
                  learningObjective: 'lo',
                  expectedActivity: 'ea',
                  order: 1,
                },
              ],
            },
          },
        },
      },
      select: {
        id: true,
        pathway: { select: { steps: { select: { id: true } } } },
      },
    });
    careerIds.push(career.id);

    if (withLearner) {
      await prisma.userPathway.create({
        data: { userId: ids[Role.USER], careerId: career.id, isActive: true },
      });
      await prisma.userPathwayStep.create({
        data: {
          userId: ids[Role.USER],
          pathwayStepId: career.pathway!.steps[0].id,
          status: PathwayStepStatus.COMPLETED,
        },
      });
    }
    return career.id;
  };

  const retire = (id: string, role: Role = Role.PUBLISHER) =>
    request(app.getHttpServer())
      .patch(`${apiPrefix}/admin/careers/${id}/retire`)
      .set('Authorization', `Bearer ${tokens[role]}`);

  const progressCounts = (careerId: string) =>
    Promise.all([
      prisma.userPathway.count({ where: { careerId } }),
      prisma.userPathwayStep.count({
        where: { pathwayStep: { pathway: { careerId } } },
      }),
    ]);

  const statusOf = async (id: string) =>
    (await prisma.career.findUniqueOrThrow({ where: { id } })).status;

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
        data: { name: `Retire Field ${timestamp}`, slug: `${marker}-field` },
      })
    ).id;
  });

  afterAll(async () => {
    await prisma.career.deleteMany({ where: { id: { in: careerIds } } });
    await prisma.field.deleteMany({ where: { id: fieldId } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await app.close();
  });

  it('retires a published career and leaves version and progress untouched', async () => {
    const careerId = await seedCareer(CareerStatus.PUBLISHED, true);
    const before = await progressCounts(careerId);
    expect(before).toEqual([1, 1]);

    const response = await retire(careerId).expect(200);

    expect(response.body).toMatchObject({
      id: careerId,
      status: 'RETIRED',
      version: LIVE_VERSION,
    });
    const career = await prisma.career.findUniqueOrThrow({
      where: { id: careerId },
    });
    expect(career.status).toBe(CareerStatus.RETIRED);
    expect(career.version).toBe(LIVE_VERSION);
    expect(await progressCounts(careerId)).toEqual(before);
    const saved = await prisma.userPathway.findFirstOrThrow({
      where: { careerId },
    });
    expect(saved.isActive).toBe(true);
  });

  it('hides the retired career from the public detail endpoint', async () => {
    const careerId = await seedCareer(CareerStatus.PUBLISHED);

    await retire(careerId).expect(200);

    await request(app.getHttpServer())
      .get(`${apiPrefix}/careers/${careerId}`)
      .expect(404);
  });

  it.each([Role.PUBLISHER, Role.ADMIN])(
    'lets a %s retire a career',
    async (role) => {
      const careerId = await seedCareer(CareerStatus.PUBLISHED);

      await retire(careerId, role).expect(200);

      expect(await statusOf(careerId)).toBe(CareerStatus.RETIRED);
    },
  );

  it.each([CareerStatus.DRAFT, CareerStatus.RETIRED])(
    'returns 409 CAREER_NOT_PUBLISHED for a %s career',
    async (status) => {
      const careerId = await seedCareer(status);

      const response = await retire(careerId).expect(409);

      expect(response.body).toMatchObject({ code: 'CAREER_NOT_PUBLISHED' });
      expect(await statusOf(careerId)).toBe(status);
    },
  );

  it('returns 409 when the same career is retired twice', async () => {
    const careerId = await seedCareer(CareerStatus.PUBLISHED);

    await retire(careerId).expect(200);
    await retire(careerId).expect(409);
  });

  it.each([Role.USER, Role.EDITOR, Role.REVIEWER])(
    'returns 403 to %s and leaves the career published',
    async (role) => {
      const careerId = await seedCareer(CareerStatus.PUBLISHED);

      const response = await retire(careerId, role).expect(403);

      expect(response.body.error).toBe('FORBIDDEN');
      expect(await statusOf(careerId)).toBe(CareerStatus.PUBLISHED);
    },
  );

  it('returns 401 without an access token', async () => {
    const careerId = await seedCareer(CareerStatus.PUBLISHED);

    await request(app.getHttpServer())
      .patch(`${apiPrefix}/admin/careers/${careerId}/retire`)
      .expect(401);
  });

  it('returns 404 for a career that does not exist', async () => {
    const response = await retire(
      '00000000-0000-4000-8000-000000000000',
    ).expect(404);

    expect(response.body.error).toBe('NOT_FOUND');
  });

  it('returns 400 for an id that is not a UUID', async () => {
    await retire('not-a-uuid').expect(400);
  });
});
