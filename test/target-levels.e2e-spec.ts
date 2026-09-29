import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { apiPrefix as resolveApiPrefix, configureApp } from '../src/common';
import { EnvironmentVariables } from '../src/config';

describe('Target levels (e2e)', () => {
  let app: INestApplication;
  let apiPrefix: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();

    configureApp(app);

    apiPrefix = `/${resolveApiPrefix(
      app.get<ConfigService<EnvironmentVariables, true>>(ConfigService),
    )}`;

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /target-levels', () => {
    it('should return 200 OK with the target level values to an unauthenticated client', async () => {
      const response = await request(app.getHttpServer())
        .get(`${apiPrefix}/target-levels`)
        .expect(200);

      expect(response.body).toEqual(['STUDENT', 'RECENT_GRAD', 'EARLY_CAREER']);
    });
  });
});
