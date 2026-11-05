import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { apiPrefix as resolveApiPrefix, configureApp } from '../src/common';
import { EnvironmentVariables } from '../src/config';
import { NotificationService } from '../src/notifications';
import { PrismaService } from '../src/prisma';
import { Role } from '../src/generated/prisma/client';
import {
  cleanupUsers,
  notificationMock,
  registerAndVerify,
  waitForOtp,
  wireNotificationMock,
} from './utils/auth';

describe('Auth names and admin login (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let apiPrefix: string;

  const userIds: string[] = [];
  const password = 'Password123!';
  const marker = `e2e-names-${Date.now()}`;
  const emailFor = (label: string) => `${marker}-${label}@test.com`;

  const register = (body: Record<string, unknown>) =>
    request(app.getHttpServer()).post(`${apiPrefix}/auth/register`).send(body);

  const adminLogin = (email: string, pwd = password) =>
    request(app.getHttpServer())
      .post(`${apiPrefix}/auth/admin/login`)
      .send({ email, password: pwd });

  const verify = async (email: string) => {
    const otp = await waitForOtp(email);
    const res = await request(app.getHttpServer())
      .post(`${apiPrefix}/auth/verify-email`)
      .send({ email, otp })
      .expect(200);
    const body = res.body as {
      accessToken: string;
      user: Record<string, unknown> & { id: string };
    };
    userIds.push(body.user.id);
    return body;
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
  });

  afterAll(async () => {
    if (prisma) await cleanupUsers(prisma, userIds);
    await app?.close();
  });

  describe('POST /auth/register names', () => {
    it('stores firstName and lastName and returns them with a derived fullName', async () => {
      const email = emailFor('names');
      await register({
        email,
        password,
        firstName: ' Ada ',
        lastName: 'Obi',
      }).expect(201);
      const { accessToken, user } = await verify(email);

      expect(user).toMatchObject({
        firstName: 'Ada',
        lastName: 'Obi',
        fullName: 'Ada Obi',
      });

      const me = await request(app.getHttpServer())
        .get(`${apiPrefix}/auth/me`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      expect(me.body).toMatchObject({
        firstName: 'Ada',
        lastName: 'Obi',
        fullName: 'Ada Obi',
      });
    });

    it('still accepts fullName alone and splits it', async () => {
      const email = emailFor('legacy');
      await register({ email, password, fullName: 'Ada Lovelace Obi' }).expect(
        201,
      );
      const { user } = await verify(email);

      expect(user).toMatchObject({
        firstName: 'Ada',
        lastName: 'Lovelace Obi',
        fullName: 'Ada Lovelace Obi',
      });
    });

    it.each([
      ['no name at all', {}],
      ['firstName without lastName', { firstName: 'Ada' }],
      ['lastName without firstName', { lastName: 'Obi' }],
      ['a blank fullName', { fullName: '   ' }],
      [
        'an over-long firstName',
        { firstName: 'a'.repeat(51), lastName: 'Obi' },
      ],
    ])('returns 400 for %s', async (_label, names) => {
      const response = await register({
        email: emailFor('bad'),
        password,
        ...names,
      }).expect(400);

      expect(response.body.error).toBe('VALIDATION_ERROR');
    });

    it('still returns 409 for a duplicate email', async () => {
      const email = emailFor('dupe');
      await register({
        email,
        password,
        firstName: 'Ada',
        lastName: 'Obi',
      }).expect(201);
      await verify(email);

      await register({
        email,
        password,
        firstName: 'Ada',
        lastName: 'Obi',
      }).expect(409);
    });
  });

  describe('PATCH /users/me keeps the names in step', () => {
    it('updates firstName, lastName and fullName together', async () => {
      const email = emailFor('patch');
      await register({
        email,
        password,
        firstName: 'Ada',
        lastName: 'Obi',
      }).expect(201);
      const { accessToken } = await verify(email);

      const response = await request(app.getHttpServer())
        .patch(`${apiPrefix}/users/me`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ fullName: 'Grace Hopper' })
        .expect(200);

      expect(response.body).toMatchObject({
        firstName: 'Grace',
        lastName: 'Hopper',
        fullName: 'Grace Hopper',
      });
    });
  });

  describe('POST /auth/admin/login', () => {
    const makeUser = async (label: string, role: Role) => {
      const email = emailFor(label);
      const registered = await registerAndVerify(app, apiPrefix, {
        email,
        password,
      });
      userIds.push(registered.id);
      await prisma.user.update({
        where: { id: registered.id },
        data: { role },
      });
      return email;
    };

    it('returns 403 FORBIDDEN for a USER with the right password', async () => {
      const response = await adminLogin(
        await makeUser('user', Role.USER),
      ).expect(403);

      expect(response.body.error).toBe('FORBIDDEN');
      expect(response.body).not.toHaveProperty('accessToken');
    });

    it.each([Role.EDITOR, Role.ADMIN])(
      'lets %s in and returns the role',
      async (role) => {
        const response = await adminLogin(
          await makeUser(role.toLowerCase(), role),
        ).expect(200);

        expect(response.body.accessToken).toEqual(expect.any(String));
        expect(response.body.user.role).toBe(role);
      },
    );

    it('returns 401 for a wrong password, even on a USER account', async () => {
      const email = await makeUser('wrongpw', Role.USER);

      await adminLogin(email, 'WrongPassword1!').expect(401);
    });

    it('returns 401 for an unverified account', async () => {
      const email = emailFor('unverified');
      await register({
        email,
        password,
        firstName: 'Ada',
        lastName: 'Obi',
      }).expect(201);
      const user = await prisma.user.findUniqueOrThrow({ where: { email } });
      userIds.push(user.id);

      await adminLogin(email).expect(401);
    });

    it('leaves /auth/login working for a USER', async () => {
      const email = await makeUser('plainlogin', Role.USER);

      await request(app.getHttpServer())
        .post(`${apiPrefix}/auth/login`)
        .send({ email, password })
        .expect(200);
    });
  });
});
