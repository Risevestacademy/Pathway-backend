import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { apiPrefix as resolveApiPrefix, configureApp } from './../src/common';
import { EnvironmentVariables } from './../src/config';

describe('Health (e2e)', () => {
  let app: INestApplication<App>;
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

  it('reports the service and database as healthy', async () => {
    const response = await request(app.getHttpServer())
      .get('/health')
      .expect(200);

    expect(response.body).toEqual(
      expect.objectContaining({
        status: 'ok',
        checks: { database: { status: 'up' } },
      }),
    );
  });

  it('returns the standard error envelope for an unknown API route', async () => {
    const response = await request(app.getHttpServer())
      .get(`${apiPrefix}/does-not-exist`)
      .expect(404);

    expect(response.body).toEqual(
      expect.objectContaining({
        statusCode: 404,
        error: 'NOT_FOUND',
        path: `${apiPrefix}/does-not-exist`,
      }),
    );
  });
});
