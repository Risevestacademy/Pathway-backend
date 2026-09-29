import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { FieldsService } from '../src/fields';
import { apiPrefix as resolveApiPrefix, configureApp } from '../src/common';
import { EnvironmentVariables } from '../src/config';

describe('Fields (e2e)', () => {
  let app: INestApplication;
  let apiPrefix: string;

  const mockFields = [
    {
      id: 'field-data',
      name: 'Data & Analytics',
      slug: 'data-analytics',
    },
    {
      id: 'field-software',
      name: 'Software Engineering',
      slug: 'software-engineering',
    },
  ];

  const mockFieldsService = {
    getFields: jest.fn(),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(FieldsService)
      .useValue(mockFieldsService)
      .compile();
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

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /fields', () => {
    it('should return 200 OK with all fields to an unauthenticated client', async () => {
      mockFieldsService.getFields.mockResolvedValue(mockFields);

      const response = await request(app.getHttpServer())
        .get(`${apiPrefix}/fields`)
        .expect(200);

      expect(response.body).toEqual(mockFields);
      expect(mockFieldsService.getFields).toHaveBeenCalledTimes(1);
    });

    it('should return 200 OK with an empty array when there are no fields', async () => {
      mockFieldsService.getFields.mockResolvedValue([]);

      const response = await request(app.getHttpServer())
        .get(`${apiPrefix}/fields`)
        .expect(200);

      expect(response.body).toEqual([]);
    });
  });
});
