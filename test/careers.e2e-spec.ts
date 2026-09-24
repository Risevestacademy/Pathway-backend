import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { CareersService } from '../src/catalog/careers';

describe('Careers (e2e)', () => {
  let app: INestApplication;

  const mockCareersList = [
    {
      id: '123e4567-e89b-12d3-a456-426614174000',
      slug: 'software-engineer',
      title: 'Software Engineer',
      shortDescription: 'Builds scalable web applications.',
    },
  ];

  const mockCareersService = {
    getPublicCareers: jest.fn().mockResolvedValue(mockCareersList),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(CareersService)
      .useValue(mockCareersService)
      .compile();

    app = moduleFixture.createNestApplication();

    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
      }),
    );

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /careers', () => {
    it('should return 200 OK with public careers list', async () => {
      const response = await request(app.getHttpServer())
        .get('/careers')
        .expect(200);

      expect(response.body).toEqual(mockCareersList);
      expect(mockCareersService.getPublicCareers).toHaveBeenCalledWith({});
    });

    it('should pass query parameters (interest & level) to service layer', async () => {
      const queryParams = {
        level: 'RECENT_GRAD',
        interest: 'software-engineering',
      };

      await request(app.getHttpServer())
        .get('/careers')
        .query(queryParams)
        .expect(200);

      expect(mockCareersService.getPublicCareers).toHaveBeenCalledWith(
        expect.objectContaining(queryParams),
      );
    });
  });
});
