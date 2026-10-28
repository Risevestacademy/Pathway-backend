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

describe('Admin revisions — diff (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let apiPrefix: string;

  const userIds: string[] = [];
  const marker = `e2e-diff-${Date.now()}`;
  const tokens = {} as Record<Role, string>;

  let fieldId: string;
  let careerId: string;
  let revisionId: string;
  let snapshot: CareerSnapshot;

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

    for (const role of [Role.USER, Role.REVIEWER, Role.ADMIN]) {
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
    }

    const field = await prisma.field.create({
      data: { name: `Field ${marker}`, slug: `field-${marker}` },
    });
    fieldId = field.id;

    const skill = await prisma.skill.create({
      data: { name: `Skill ${marker}` },
    });

    const career = await prisma.career.create({
      data: {
        title: `Career ${marker}`,
        slug: `career-${marker}`,
        description: 'desc',
        roleSummary: 'summary',
        exampleActivities: [],
        fieldId,
        status: 'PUBLISHED',
        version: 3,
        skills: { create: [{ skillId: skill.id, importance: 'REQUIRED' }] },
        pathway: {
          create: {
            title: 'Pathway',
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
      include: { pathway: { include: { steps: true } } },
    });
    careerId = career.id;

    snapshot = {
      schemaVersion: 1,
      career: {
        title: `Career ${marker} (revised)`,
        slug: `career-${marker}`,
        description: 'desc',
        roleSummary: 'summary',
        fieldId,
        targetLevels: [],
        exampleActivities: [],
        typicalEducationNote: null,
        certificationsNote: null,
      },
      pathway: { title: 'Pathway', description: null },
      steps: [
        {
          id: career.pathway!.steps[0].id,
          order: 1,
          title: 'Step 1',
          description: null,
          learningObjective: 'lo',
          prerequisites: null,
          expectedActivity: 'ea',
          skillIds: [],
          resourceIds: [],
        },
      ],
      skills: [{ skillId: skill.id, importance: 'REQUIRED' }],
      outlook: [],
      resources: [],
    };

    const revision = await prisma.contentRevision.create({
      data: {
        careerId,
        baseVersion: 3,
        snapshot: snapshot as unknown as object,
        createdById: userIds[0],
      },
    });
    revisionId = revision.id;
  });

  afterAll(async () => {
    await prisma.contentRevision.deleteMany({ where: { careerId } });
    await prisma.career.deleteMany({ where: { id: careerId } });
    await prisma.field.deleteMany({ where: { id: fieldId } });
    await prisma.skill.deleteMany({ where: { name: `Skill ${marker}` } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await app.close();
  });
  const getDiff = (token = tokens[Role.REVIEWER]) =>
    request(app.getHttpServer())
      .get(`${apiPrefix}/admin/revisions/${revisionId}/diff`)
      .set('Authorization', `Bearer ${token}`);

  it('returns a reviewer-shaped diff grouped by section', async () => {
    const response = await getDiff().expect(200);

    // ── Revision metadata ─────────────────────────────────────────────
    expect(response.body.revisionId).toBe(revisionId);
    expect(response.body.title).toContain('Career');
    expect(typeof response.body.submittedBy).toBe('string');
    expect(response.body.submittedAt).toMatch(/ago|Just now/);

    // ── Plan metadata (still at the top level) ────────────────────────
    expect(response.body.baseVersion).toBe(3);
    expect(response.body.liveVersion).toBe(3);
    expect(response.body.stale).toBe(false);
    expect(response.body.blockers).toEqual([]);
    expect(response.body.advisories).toEqual([]);

    // ── Sections (grouped, not flat operations) ───────────────────────
    expect(response.body.sections).toBeDefined();
    expect(response.body.sections).not.toHaveProperty('operations');

    // The title was changed in the fixture → one entry in career.changed
    expect(response.body.sections.career).toBeDefined();
    const titleChange = (
      response.body.sections.career.changed as Array<{
        field: string;
        label: string;
        before: string;
        after: string;
      }>
    ).find((c) => c.field === 'title');

    expect(titleChange).toEqual({
      field: 'title',
      label: 'Title',
      before: `Career ${marker}`,
      after: `Career ${marker} (revised)`,
    });

    // Empty sections are stripped, so unchanged areas don't appear
    expect(response.body.sections).not.toHaveProperty('outlook');
    expect(response.body.sections).not.toHaveProperty('resources');
    expect(response.body.sections).not.toHaveProperty('skills');

    // No secrets or internal identifiers leaked in the payload
    const body = JSON.stringify(response.body);
    expect(body).not.toMatch(/[0-9a-f]{64}/);
    expect(body).not.toContain('tokenHash');
  });

  it('returns 401 without a token', async () => {
    await request(app.getHttpServer())
      .get(`${apiPrefix}/admin/revisions/${revisionId}/diff`)
      .expect(401);
  });

  it('returns 403 to a USER', async () => {
    await getDiff(tokens[Role.USER]).expect(403);
  });

  it('returns 404 for an unknown revision', async () => {
    await request(app.getHttpServer())
      .get(
        `${apiPrefix}/admin/revisions/00000000-0000-4000-8000-000000000000/diff`,
      )
      .set('Authorization', `Bearer ${tokens[Role.REVIEWER]}`)
      .expect(404);
  });

  it('performs no database writes', async () => {
    const beforeRevision = await prisma.contentRevision.findUniqueOrThrow({
      where: { id: revisionId },
    });
    const beforeCareer = await prisma.career.findUniqueOrThrow({
      where: { id: careerId },
    });

    await getDiff().expect(200);

    const afterRevision = await prisma.contentRevision.findUniqueOrThrow({
      where: { id: revisionId },
    });
    const afterCareer = await prisma.career.findUniqueOrThrow({
      where: { id: careerId },
    });

    expect(afterRevision).toEqual(beforeRevision);
    expect(afterCareer).toEqual(beforeCareer);
  });
});
