import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

describe('AuthController (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    // Apply global pipes if you have them
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('/auth/register (POST) - success', () => {
    return request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: 'e2e@test.com', password: 'Password123!' })
      .expect(201);
  });

  it('/auth/login (POST) - wrong password', () => {
    return request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'e2e@test.com', password: 'WrongPassword!' })
      .expect(401);
  });
});
