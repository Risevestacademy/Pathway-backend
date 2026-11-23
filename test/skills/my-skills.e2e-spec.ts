import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { AppModule } from '../../src/app.module';
import { apiPrefix as resolveApiPrefix, configureApp } from '../../src/common';
import { EnvironmentVariables } from '../../src/config';
import { UserSkillStatus } from '../../src/generated/prisma/client';
import { NotificationService } from '../../src/notifications';
import { PrismaService } from '../../src/prisma';
import {
  notificationMock,
  registerAndVerify,
  wireNotificationMock,
  type RegisteredUser,
} from '../utils/auth';

describe('Me — Skills Write (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let apiPrefix: string;
  let skillAId: string;
  let skillBId: string;
  const createdUserIds: string[] = [];

  const registerUser = async (label: string): Promise<RegisteredUser> => {
    const user = await registerAndVerify(app, apiPrefix, {
      email: `e2e-me-skills-${label}-${Date.now()}@test.com`,
    });
    createdUserIds.push(user.id);
    return user;
  };

  const putMine = (user: RegisteredUser, skillIds: string[]) =>
    request(app.getHttpServer())
      .put(`${apiPrefix}/me/skills`)
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ skillIds });

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(NotificationService)
      .useValue(notificationMock)
      .compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    apiPrefix = `/${resolveApiPrefix(app.get<ConfigService<EnvironmentVariables, true>>(ConfigService))}`;
    await app.listen(0, '127.0.0.1');
    prisma = app.get(PrismaService);
    wireNotificationMock();

    const a = await prisma.skill.create({
      data: { name: `Skill A ${Date.now()}` },
    });
    const b = await prisma.skill.create({
      data: { name: `Skill B ${Date.now()}` },
    });
    skillAId = a.id;
    skillBId = b.id;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.skill.deleteMany({
      where: { id: { in: [skillAId, skillBId] } },
    });
    await app.close();
  });

  it('returns 401 without a token', async () => {
    await request(app.getHttpServer())
      .put(`${apiPrefix}/me/skills`)
      .send({ skillIds: [] })
      .expect(401);
  });

  it("replaces the user's skill set", async () => {
    const user = await registerUser('replace');

    // 1. Set initial skills
    await putMine(user, [skillAId, skillBId]).expect(204);

    const initial = await prisma.userSkill.findMany({
      where: { userId: user.id, onProfile: true },
    });
    expect(initial).toHaveLength(2);

    // 2. Replace with just A
    await putMine(user, [skillAId]).expect(204);

    const after = await prisma.userSkill.findMany({
      where: { userId: user.id, onProfile: true },
    });
    expect(after).toHaveLength(1);
    expect(after[0].skillId).toBe(skillAId);
  });

  it('starts a new profile skill as not assessed', async () => {
    const user = await registerUser('new');

    await putMine(user, [skillAId]).expect(204);

    expect(
      await prisma.userSkill.findFirstOrThrow({ where: { userId: user.id } }),
    ).toMatchObject({
      skillId: skillAId,
      onProfile: true,
      status: UserSkillStatus.NOT_SURE,
      rating: null,
      assessedAt: null,
    });
  });

  it('keeps a Skill Check answer when the list is cleared', async () => {
    const user = await registerUser('assessed');
    const assessedAt = new Date('2026-11-20T10:00:00.000Z');
    await prisma.userSkill.create({
      data: {
        userId: user.id,
        skillId: skillAId,
        status: UserSkillStatus.HAVE,
        rating: 4,
        onProfile: true,
        assessedAt,
      },
    });

    await putMine(user, []).expect(204);

    expect(
      await prisma.userSkill.findFirstOrThrow({ where: { userId: user.id } }),
    ).toMatchObject({
      onProfile: false,
      status: UserSkillStatus.HAVE,
      rating: 4,
      assessedAt,
    });
  });

  it('rejects unknown skill IDs with UNKNOWN_SKILL', async () => {
    const user = await registerUser('unknown');
    const res = await putMine(user, [
      '11111111-1111-4111-8111-111111111111',
    ]).expect(400);

    expect(res.body.error).toBe('BAD_REQUEST');
    expect(res.body.code).toBe('UNKNOWN_SKILL');
  });
});
