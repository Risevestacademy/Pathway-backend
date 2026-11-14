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
  cleanupUsers,
  notificationMock,
  registerAndVerify,
  RegisteredUser,
  wireNotificationMock,
} from '../utils/auth';
import { CatalogFixture, cleanupCatalog, seedCatalog } from '../utils/catalog';

describe('GET /pathways/:pathwayId (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let apiPrefix: string;
  let fixture: CatalogFixture;
  let user: RegisteredUser;

  const marker = `e2e-pathway-read-${Date.now()}`;

  const get = (pathwayId: string, bearer?: string) => {
    const req = request(app.getHttpServer()).get(
      `${apiPrefix}/pathways/${pathwayId}`,
    );
    return bearer ? req.set('Authorization', `Bearer ${bearer}`) : req;
  };

  type Stage = {
    id: string;
    title: string;
    description: string | null;
    order: number;
    progress: { completed: number; total: number; percentage: number } | null;
    quiz: { status: string } | null;
    steps: Step[];
  };

  type Step = {
    id: string;
    title: string;
    order: number;
    status: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED' | null;
    description: string | null;
    expectedActivity: string;
    careerReadiness: string;
    skills: { name: string }[];
    resources: {
      id: string;
      title: string;
      url: string;
      type: string;
      costStatus: string;
      estimatedWeeks: number | null;
      provider: string;
    }[];
    tasks: {
      id: string;
      title: string;
      goal: string;
      estimatedWeeks: number | null;
      whatToMake: string[];
      hints: string[];
      checklist: string[];
    }[];
  };

  const allSteps = (body: { stages: Stage[] }): Step[] =>
    body.stages.flatMap((s) => s.steps);

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(NotificationService)
      .useValue(notificationMock)
      .compile();

    app = moduleRef.createNestApplication();
    configureApp(app);
    apiPrefix = `/${resolveApiPrefix(
      app.get<ConfigService<EnvironmentVariables, true>>(ConfigService),
    )}`;
    await app.listen(0, '127.0.0.1');

    wireNotificationMock();

    prisma = app.get(PrismaService);
    fixture = await seedCatalog(prisma, { suffix: marker });
    user = await registerAndVerify(app, apiPrefix, {
      email: `${marker}@test.com`,
    });
  });

  afterEach(async () => {
    if (!prisma || !user) return;
    await prisma.userPathwayStep.deleteMany({ where: { userId: user.id } });
    await prisma.userPathway.deleteMany({ where: { userId: user.id } });
  });

  afterAll(async () => {
    if (prisma) {
      if (user) {
        await prisma.userPathwayStep.deleteMany({ where: { userId: user.id } });
        await prisma.userPathway.deleteMany({ where: { userId: user.id } });
        await cleanupUsers(prisma, [user.id]);
      }
      if (fixture) await cleanupCatalog(prisma, fixture);
    }
    if (app) await app.close();
  });

  describe('anonymous caller', () => {
    it('returns outline with stages and steps, no per-user status or progress', async () => {
      const res = await get(fixture.publishedPathwayId).expect(200);
      const body = res.body as {
        progress: unknown;
        stages: Stage[];
      };

      expect(body.progress).toBeNull();
      expect(body.stages.length).toBeGreaterThan(0);

      const steps = allSteps(body);
      expect(steps.length).toBeGreaterThan(0);
      expect(steps.every((s) => s.status === null)).toBe(true);
      expect(body.stages.every((s) => s.progress === null)).toBe(true);
    });

    it('sends heavy data only on the first step for anonymous callers', async () => {
      const res = await get(fixture.publishedPathwayId).expect(200);
      const body = res.body as { stages: Stage[] };
      const steps = allSteps(body);

      // The "start here" step always carries resources + tasks so anonymous
      // visitors can preview what a pathway step looks like.
      const withHeavy = steps.filter(
        (s) => s.resources.length > 0 || s.tasks.length > 0,
      );
      expect(withHeavy).toHaveLength(1);
      expect(withHeavy[0].id).toBe(fixture.firstStepId);

      // Every step (including the rest) must still have the keys, just empty
      // arrays where heavy data isn't loaded.
      for (const s of steps) {
        expect(s.resources).toBeInstanceOf(Array);
        expect(s.tasks).toBeInstanceOf(Array);
        if (s.id !== fixture.firstStepId) {
          expect(s.resources).toEqual([]);
          expect(s.tasks).toEqual([]);
        }
      }
    });

    it('never leaks curationRationale', async () => {
      const res = await get(fixture.publishedPathwayId).expect(200);
      expect(JSON.stringify(res.body)).not.toMatch(/"curationRationale"/);
    });
  });

  describe('signed-in caller', () => {
    it('reflects completed steps on the per-step status', async () => {
      await prisma.userPathway.create({
        data: {
          userId: user.id,
          careerId: fixture.publishedCareerId,
          isActive: true,
          startStepId: fixture.firstStepId,
        },
      });
      await prisma.userPathwayStep.create({
        data: {
          userId: user.id,
          pathwayStepId: fixture.firstStepId,
          status: 'COMPLETED',
          completedAt: new Date(),
        },
      });

      const res = await get(
        fixture.publishedPathwayId,
        user.accessToken,
      ).expect(200);
      const body = res.body as {
        stages: Stage[];
        progress: { completed: number; total: number };
        career: {
          retired: boolean;
          stageCount: number;
          stepCount: number;
        };
      };

      expect(body.progress.completed).toBe(1);
      expect(body.progress.total).toBeGreaterThanOrEqual(1);

      expect(body.career.retired).toBe(false);
      expect(typeof body.career.stageCount).toBe('number');
      expect(typeof body.career.stepCount).toBe('number');

      const first = allSteps(body).find((s) => s.id === fixture.firstStepId);
      expect(first).toBeDefined();
      expect(first?.status).toBe('COMPLETED');
    });

    it('sends heavy data only on the first step for anonymous callers', async () => {
      const res = await get(fixture.publishedPathwayId).expect(200);
      const body = res.body as { stages: Stage[] };
      const steps = allSteps(body);

      const withHeavy = steps.filter(
        (s) => s.resources.length > 0 || s.tasks.length > 0,
      );
      expect(withHeavy.length).toBe(1);
      expect(withHeavy[0].id).toBe(fixture.firstStepId);

      // Every other step must still have the keys, just empty arrays.
      for (const s of steps) {
        expect(s.resources).toBeInstanceOf(Array);
        expect(s.tasks).toBeInstanceOf(Array);
        if (s.id !== fixture.firstStepId) {
          expect(s.resources).toEqual([]);
          expect(s.tasks).toEqual([]);
        }
      }
    });

    it('does not include heavy data on steps beyond the active set', async () => {
      const res = await get(
        fixture.publishedPathwayId,
        user.accessToken,
      ).expect(200);
      const body = res.body as { stages: Stage[] };
      const steps = allSteps(body);

      // The active set is at most two steps. Every other step must have
      // empty arrays (not missing keys).
      const withHeavy = steps.filter(
        (s) => s.resources.length > 0 || s.tasks.length > 0,
      );
      expect(withHeavy.length).toBeLessThanOrEqual(2);
      for (const s of steps) {
        if (!withHeavy.includes(s)) {
          expect(s.resources).toEqual([]);
          expect(s.tasks).toEqual([]);
        }
      }
    });
  });

  describe('career status', () => {
    it('returns 404 for a draft career', async () => {
      await get(fixture.draftPathwayId).expect(404);
    });

    it('returns 200 for a retired career, flagged with career.retired = true', async () => {
      const res = await get(fixture.retiredPathwayId).expect(200);
      const body = res.body as { career: { retired: boolean } };
      expect(body.career.retired).toBe(true);
    });
  });

  describe('input validation', () => {
    it('returns 400 for a malformed UUID', async () => {
      await get('not-a-uuid').expect(400);
    });

    it('returns 404 for an unknown UUID', async () => {
      await get('00000000-0000-0000-0000-000000000000').expect(404);
    });
  });
});
