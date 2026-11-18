import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { AppModule } from '../../src/app.module';
import { apiPrefix as resolveApiPrefix, configureApp } from '../../src/common';
import { EnvironmentVariables } from '../../src/config';
import { NotificationService } from '../../src/notifications';
import { PrismaService } from '../../src/prisma';
import { UserSkillStatus } from '../../src/generated/prisma/client';
import {
  notificationMock,
  registerAndVerify,
  wireNotificationMock,
  type RegisteredUser,
} from '../utils/auth';
import {
  seedCatalog,
  cleanupCatalog,
  type CatalogFixture,
} from '../utils/catalog';

interface AssessmentStatsBody {
  have: number;
  dontHave: number;
  notSure: number;
}

interface SkillGapBody {
  skillId: string;
  skillName: string;
  stepId: string;
  stepTitle: string;
  stepOrder: number;
}

interface SaveAssessmentBody {
  updated: number;
  allGapsClosed: boolean;
  startStepId: string | null;
  startStepTitle: string | null;
  startStepDescription: string | null;
  stats: AssessmentStatsBody;
  gaps: SkillGapBody[];
}

interface AssessmentSkillBody {
  skillId: string;
  skillName: string;
  status: UserSkillStatus;
  rating: number | null;
}

interface AssessmentStageBody {
  stageId: string;
  stageTitle: string;
  stageOrder: number;
  skills: AssessmentSkillBody[];
}

interface AssessmentBody {
  careerId: string;
  pathwayId: string;
  stages: AssessmentStageBody[];
}

describe('Me — Skills Assessment (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let apiPrefix: string;
  let fixture: CatalogFixture;

  // Scoped to this file — clean up in afterAll.
  let skillAId: string;
  let skillBId: string;

  const createdUserIds: string[] = [];

  const registerUser = async (label: string): Promise<RegisteredUser> => {
    const registered = await registerAndVerify(app, apiPrefix, {
      email: `e2e-assessment-${label}-${Date.now()}@test.com`,
    });
    createdUserIds.push(registered.id);
    return registered;
  };

  const saveActive = (user: RegisteredUser) =>
    request(app.getHttpServer())
      .put(`${apiPrefix}/me/active-pathway`)
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ careerId: fixture.publishedCareerId })
      .expect(200);

  const getAssessment = (user: RegisteredUser) =>
    request(app.getHttpServer())
      .get(`${apiPrefix}/me/skills/assessment`)
      .set('Authorization', `Bearer ${user.accessToken}`);

  const putAssessment = (user: RegisteredUser, body: object) =>
    request(app.getHttpServer())
      .put(`${apiPrefix}/me/skills/assessment`)
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send(body);

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

    await app.listen(0, '127.0.0.1');
    prisma = app.get(PrismaService);
    wireNotificationMock();

    fixture = await seedCatalog(prisma, { suffix: `assessment-${Date.now()}` });

    // Scoped skills on the published pathway's first step. seedCatalog
    // doesn't seed skills; the assessment feature needs them, so we
    // attach them here and clean them up below.
    const skillA = await prisma.skill.create({
      data: { name: `E2E Assessment Skill A ${Date.now()}` },
    });
    const skillB = await prisma.skill.create({
      data: { name: `E2E Assessment Skill B ${Date.now()}` },
    });
    skillAId = skillA.id;
    skillBId = skillB.id;

    await prisma.pathwayStepSkill.createMany({
      data: [
        { pathwayStepId: fixture.firstStepId, skillId: skillAId },
        { pathwayStepId: fixture.firstStepId, skillId: skillBId },
      ],
    });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    // Skills first (FK to step), then pathway step skills cascade with step.
    await prisma.skill.deleteMany({
      where: { id: { in: [skillAId, skillBId] } },
    });
    await cleanupCatalog(prisma, fixture);
    await app.close();
  });

  describe('auth', () => {
    it('returns 401 without an access token on both routes', async () => {
      await request(app.getHttpServer())
        .get(`${apiPrefix}/me/skills/assessment`)
        .expect(401);
      await request(app.getHttpServer())
        .put(`${apiPrefix}/me/skills/assessment`)
        .send({ skills: [] })
        .expect(401);
    });

    it('returns 404 when the user has no active pathway', async () => {
      const user = await registerUser('no-pathway');

      await getAssessment(user).expect(404);
      await putAssessment(user, {
        skills: [
          { skillId: skillAId, status: UserSkillStatus.HAVE, rating: 4 },
        ],
      }).expect(404);
    });
  });

  describe('read', () => {
    it('pre-fills saved status and rating, defaults the rest to NOT_SURE', async () => {
      const user = await registerUser('read');
      await saveActive(user);
      await prisma.userSkill.create({
        data: {
          userId: user.id,
          skillId: skillAId,
          status: UserSkillStatus.HAVE,
          rating: 4,
        },
      });

      const response = await getAssessment(user).expect(200);
      const body = response.body as AssessmentBody;

      expect(body.careerId).toBe(fixture.publishedCareerId);
      expect(body.pathwayId).toBe(fixture.publishedPathwayId);

      // Both skills live on step 1 → stage A.
      const stageA = body.stages.find(
        (s) => s.stageId === fixture.firstStageId,
      );
      expect(stageA).toBeDefined();

      const skillA = stageA!.skills.find((s) => s.skillId === skillAId);
      expect(skillA).toMatchObject({
        status: UserSkillStatus.HAVE,
        rating: 4,
      });

      const skillB = stageA!.skills.find((s) => s.skillId === skillBId);
      expect(skillB).toMatchObject({
        status: UserSkillStatus.NOT_SURE,
        rating: null,
      });
    });
  });

  describe('write', () => {
    it('changes only the skills sent', async () => {
      const user = await registerUser('delta');
      await saveActive(user);
      await prisma.userSkill.createMany({
        data: [
          {
            userId: user.id,
            skillId: skillAId,
            status: UserSkillStatus.HAVE,
            rating: 3,
          },
          {
            userId: user.id,
            skillId: skillBId,
            status: UserSkillStatus.NOT_SURE,
            rating: null,
          },
        ],
      });

      const beforeB = await prisma.userSkill.findUniqueOrThrow({
        where: { userId_skillId: { userId: user.id, skillId: skillBId } },
      });

      const response = await putAssessment(user, {
        skills: [{ skillId: skillAId, status: UserSkillStatus.DONT_HAVE }],
      }).expect(200);
      const body = response.body as SaveAssessmentBody;

      expect(body.updated).toBe(1);
      expect(body.allGapsClosed).toBe(false);
      // Both skills are on step 1, so the earliest gap step is step 1.
      expect(body.startStepId).toBe(fixture.firstStepId);

      const afterA = await prisma.userSkill.findUniqueOrThrow({
        where: { userId_skillId: { userId: user.id, skillId: skillAId } },
      });
      const afterB = await prisma.userSkill.findUniqueOrThrow({
        where: { userId_skillId: { userId: user.id, skillId: skillBId } },
      });

      expect(afterA.status).toBe(UserSkillStatus.DONT_HAVE);
      expect(afterA.rating).toBeNull();
      expect(afterB).toEqual(beforeB);
    });

    it('writes UserSkillProgress only for changed skills', async () => {
      const user = await registerUser('progress');
      await saveActive(user);
      await prisma.userSkill.create({
        data: {
          userId: user.id,
          skillId: skillAId,
          status: UserSkillStatus.HAVE,
          rating: 4,
        },
      });

      await putAssessment(user, {
        skills: [
          { skillId: skillAId, status: UserSkillStatus.HAVE, rating: 4 },
        ],
      }).expect(200);

      const noopProgress = await prisma.userSkillProgress.count({
        where: { userSkill: { userId: user.id } },
      });
      expect(noopProgress).toBe(0);

      await putAssessment(user, {
        skills: [{ skillId: skillAId, status: UserSkillStatus.DONT_HAVE }],
      }).expect(200);

      const rows = await prisma.userSkillProgress.findMany({
        where: { userSkill: { userId: user.id } },
      });
      expect(rows).toHaveLength(1);
      expect(rows[0].rating).toBeNull();
      expect(rows[0].source).toBe('INITIAL_ASSESSMENT');
    });

    it('never marks a step complete', async () => {
      const user = await registerUser('no-complete');
      await saveActive(user);

      await putAssessment(user, {
        skills: [
          { skillId: skillAId, status: UserSkillStatus.DONT_HAVE },
          { skillId: skillBId, status: UserSkillStatus.DONT_HAVE },
        ],
      }).expect(200);

      const count = await prisma.userPathwayStep.count({
        where: { userId: user.id },
      });
      expect(count).toBe(0);
    });

    it('sets startStepId to null when all gaps are closed', async () => {
      const user = await registerUser('all-have');
      await saveActive(user);

      const response = await putAssessment(user, {
        skills: [
          { skillId: skillAId, status: UserSkillStatus.HAVE, rating: 3 },
          { skillId: skillBId, status: UserSkillStatus.HAVE, rating: 5 },
        ],
      }).expect(200);
      const body = response.body as SaveAssessmentBody;

      expect(body.allGapsClosed).toBe(true);
      expect(body.startStepId).toBeNull();

      const row = await prisma.userPathway.findUniqueOrThrow({
        where: {
          userId_careerId: {
            userId: user.id,
            careerId: fixture.publishedCareerId,
          },
        },
      });
      expect(row.startStepId).toBeNull();
    });

    it('returns stats and gaps in roadmap order', async () => {
      const user = await registerUser('stats-gaps');
      await saveActive(user);

      const response = await putAssessment(user, {
        skills: [
          { skillId: skillAId, status: UserSkillStatus.HAVE, rating: 3 },
          { skillId: skillBId, status: UserSkillStatus.DONT_HAVE },
        ],
      }).expect(200);

      const body = response.body as SaveAssessmentBody;

      expect(body.stats).toEqual({ have: 1, dontHave: 1, notSure: 0 });
      expect(body.gaps).toHaveLength(1);
      expect(body.gaps[0]).toMatchObject({
        skillId: skillBId,
        stepId: fixture.firstStepId,
        stepOrder: 1,
      });
      expect(body.gaps[0].skillName).toEqual(expect.any(String));
      expect(body.gaps[0].stepTitle).toEqual(expect.any(String));
    });

    it('returns the start step title and description', async () => {
      const user = await registerUser('start-step-details');
      await saveActive(user);

      const response = await putAssessment(user, {
        skills: [
          { skillId: skillAId, status: UserSkillStatus.HAVE, rating: 3 },
          { skillId: skillBId, status: UserSkillStatus.DONT_HAVE },
        ],
      }).expect(200);

      const body = response.body as SaveAssessmentBody;

      expect(body.startStepId).toBe(fixture.firstStepId);
      expect(body.startStepTitle).toEqual(expect.any(String));
      expect(body.startStepDescription).toBeDefined(); // may be null or string
    });

    it('rejects a rating on a non-HAVE status', async () => {
      const user = await registerUser('validation');
      await saveActive(user);

      const response = await putAssessment(user, {
        skills: [
          { skillId: skillAId, status: UserSkillStatus.DONT_HAVE, rating: 4 },
        ],
      }).expect(400);

      expect(response.body.error).toBe('BAD_REQUEST');
      expect(response.body.code).toBe('RATING_REQUIRES_HAVE');
      expect(response.body.details.skillIds).toEqual([skillAId]);
    });

    it('rejects an unknown skillId with BAD_REQUEST', async () => {
      const user = await registerUser('unknown-skill');
      await saveActive(user);

      const response = await putAssessment(user, {
        skills: [
          {
            skillId: '00000000-0000-0000-0000-000000000000',
            status: UserSkillStatus.HAVE,
            rating: 4,
          },
        ],
      }).expect(400);

      console.log(
        'UNKNOWN SKILL BODY:',
        JSON.stringify(response.body, null, 2),
      );
      expect(response.body.error).toBe('BAD_REQUEST');
    });
  });

  describe('reset', () => {
    it('returns 401 without an access token', async () => {
      await request(app.getHttpServer())
        .delete(`${apiPrefix}/me/skills/assessment`)
        .expect(401);
    });

    it('deletes UserSkill + UserSkillProgress and clears startStepId', async () => {
      const user = await registerUser('reset');
      await saveActive(user);

      await putAssessment(user, {
        skills: [
          { skillId: skillAId, status: UserSkillStatus.DONT_HAVE },
          { skillId: skillBId, status: UserSkillStatus.HAVE, rating: 4 },
        ],
      }).expect(200);

      // Sanity: rows exist before reset
      expect(
        await prisma.userSkill.count({ where: { userId: user.id } }),
      ).toBeGreaterThan(0);
      expect(
        await prisma.userSkillProgress.count({
          where: { userSkill: { userId: user.id } },
        }),
      ).toBeGreaterThan(0);

      await request(app.getHttpServer())
        .delete(`${apiPrefix}/me/skills/assessment`)
        .set('Authorization', `Bearer ${user.accessToken}`)
        .expect(204);

      expect(await prisma.userSkill.count({ where: { userId: user.id } })).toBe(
        0,
      );
      expect(
        await prisma.userSkillProgress.count({
          where: { userSkill: { userId: user.id } },
        }),
      ).toBe(0);

      const pathwayRow = await prisma.userPathway.findUniqueOrThrow({
        where: {
          userId_careerId: {
            userId: user.id,
            careerId: fixture.publishedCareerId,
          },
        },
      });
      expect(pathwayRow.startStepId).toBeNull();
    });

    it('does not touch UserPathwayStep rows', async () => {
      const user = await registerUser('reset-preserves-steps');
      await saveActive(user);

      await putAssessment(user, {
        skills: [{ skillId: skillAId, status: UserSkillStatus.DONT_HAVE }],
      }).expect(200);

      await request(app.getHttpServer())
        .delete(`${apiPrefix}/me/skills/assessment`)
        .set('Authorization', `Bearer ${user.accessToken}`)
        .expect(204);

      expect(
        await prisma.userPathwayStep.count({ where: { userId: user.id } }),
      ).toBe(0);
    });
  });
});
