import { Test } from '@nestjs/testing';
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
  cleanupUsers,
  notificationMock,
  registerAndVerify,
  wireNotificationMock,
} from '../utils/auth';

describe('GET /auth/me skills (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let apiPrefix: string;
  let profileSkill: { id: string; name: string };
  let assessedSkill: { id: string; name: string };
  const createdUserIds: string[] = [];

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

    const select = { id: true, name: true };
    profileSkill = await prisma.skill.create({
      data: { name: `Profile skill ${Date.now()}` },
      select,
    });
    assessedSkill = await prisma.skill.create({
      data: { name: `Assessed skill ${Date.now()}` },
      select,
    });
  });

  afterAll(async () => {
    await cleanupUsers(prisma, createdUserIds);
    await prisma.skill.deleteMany({
      where: { id: { in: [profileSkill.id, assessedSkill.id] } },
    });
    await app.close();
  });

  it('returns only the skills on the profile', async () => {
    const user = await registerAndVerify(app, apiPrefix, {
      email: `e2e-me-profile-skills-${Date.now()}@test.com`,
    });
    createdUserIds.push(user.id);
    await prisma.userSkill.createMany({
      data: [
        { userId: user.id, skillId: profileSkill.id, onProfile: true },
        {
          userId: user.id,
          skillId: assessedSkill.id,
          status: UserSkillStatus.DONT_HAVE,
          assessedAt: new Date(),
        },
      ],
    });

    const res = await request(app.getHttpServer())
      .get(`${apiPrefix}/auth/me`)
      .set('Authorization', `Bearer ${user.accessToken}`)
      .expect(200);

    expect(res.body.skills).toEqual([profileSkill]);
  });
});
