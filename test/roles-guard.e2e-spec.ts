import { NotificationService } from '../src/notifications';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { Controller, Get, INestApplication, UseGuards } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import {
  apiPrefix as resolveApiPrefix,
  configureApp,
  JwtAuthGuard,
  Roles,
  RolesGuard,
} from '../src/common';
import { EnvironmentVariables } from '../src/config';
import { Role } from '../src/generated/prisma/enums';
import { PrismaService } from '../src/prisma';
import {
  notificationMock,
  registerAndVerify,
  wireNotificationMock,
} from './utils/auth';

@Controller('e2e-admin-probe')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
class AdminProbeController {
  @Get()
  probe() {
    return { ok: true };
  }
}

describe('RolesGuard (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let apiPrefix: string;

  let userId: string;
  let userToken: string;
  let adminId: string;
  let adminEmail: string;
  let preAdminToken: string;

  const password = 'Password123!';

  const login = async (email: string) => {
    const response = await request(app.getHttpServer())
      .post(`${apiPrefix}/auth/login`)
      .send({ email, password })
      .expect(200);

    return (response.body as { accessToken: string }).accessToken;
  };

  const probe = () =>
    request(app.getHttpServer()).get(`${apiPrefix}/e2e-admin-probe`);

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [AdminProbeController],
    })
      .overrideProvider(NotificationService)
      .useValue(notificationMock)
      .compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);

    const config =
      app.get<ConfigService<EnvironmentVariables, true>>(ConfigService);
    apiPrefix = `/${resolveApiPrefix(config)}`;
    prisma = app.get(PrismaService);

    await app.init();

    wireNotificationMock();

    // Regular USER.
    const user = await registerAndVerify(app, apiPrefix, {
      email: `e2e-roles-user-${Date.now()}@test.com`,
      password,
      fullName: 'Ada Obi',
      platform: 'web',
    });
    userId = user.id;
    userToken = user.accessToken;

    // Second user, promoted to ADMIN below.
    adminEmail = `e2e-roles-admin-${Date.now()}@test.com`;
    const admin = await registerAndVerify(app, apiPrefix, {
      email: adminEmail,
      password,
      fullName: 'Admin Obi',
      platform: 'web',
    });
    adminId = admin.id;
    preAdminToken = admin.accessToken;

    await prisma.user.update({
      where: { id: adminId },
      data: { role: Role.ADMIN },
    });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: { id: { in: [userId, adminId] } },
    });
    await app.close();
  });

  it('returns 401 without an access token', async () => {
    const response = await probe().expect(401);

    expect(response.body.error).toBe('UNAUTHORIZED');
  });

  it('returns 403 for a USER token', async () => {
    const response = await probe()
      .set('Authorization', `Bearer ${userToken}`)
      .expect(403);

    expect(response.body.error).toBe('FORBIDDEN');
  });

  it('allows an ADMIN token', async () => {
    const adminToken = await login(adminEmail);

    const response = await probe()
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(response.body).toEqual({ ok: true });
  });

  it('keeps rejecting a token issued before the user was promoted', async () => {
    await probe().set('Authorization', `Bearer ${preAdminToken}`).expect(403);
  });
});
