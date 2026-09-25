import { Test, TestingModule } from '@nestjs/testing';
import {
  INestApplication,
  NotFoundException,
  ValidationPipe,
} from '@nestjs/common';
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

  const mockCareerDetail = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    slug: 'software-engineer',
    title: 'Software Engineer',
    description: 'Builds scalable web applications.',
    roleSummary: 'Designs and builds software systems.',
    exampleActivities: ['Write code', 'Review pull requests'],
    typicalEducationNote: null,
    certificationsNote: null,

    field: {
      name: 'Software Engineering',
      slug: 'software-engineering',
    },

    targetLevels: ['RECENT_GRAD'],
    status: 'PUBLISHED',
    publishedAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',

    skills: [
      {
        id: 'skill-1',
        name: 'TypeScript',
      },
    ],

    outlook: [
      {
        id: 'outlook-1',
        type: 'SALARY',
        geography: 'United States',
        source: 'Example Labour Stats',
        sourceUrl: null,
        period: '2026',
        median: '65000.00',
        percentile25: null,
        percentile75: null,
        currency: 'USD',
        payPeriod: 'year',
        grossOrNet: 'gross',
        experienceLevel: 'entry-level',
        baseYear: null,
        baseValue: null,
        projectedYear: null,
        projectedValue: null,
        growthPercent: null,
        demandLevel: null,
        updatedAt: '2026-01-02T00:00:00.000Z',
      },
    ],

    pathway: {
      id: 'pathway-1',
      title: 'Backend Roadmap',
      stepCount: 3,
    },
  };

  const mockCareersService = {
    getPublicCareers: jest.fn().mockResolvedValue(mockCareersList),
    getPublishedCareerById: jest.fn().mockResolvedValue(mockCareerDetail),
    getCareerPathway: jest.fn(),
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

  describe('GET /careers/:id', () => {
    it('should return 200 OK with career details and pathway summary', async () => {
      const careerId = '123e4567-e89b-12d3-a456-426614174000';

      const response = await request(app.getHttpServer())
        .get(`/careers/${careerId}`)
        .expect(200);

      expect(response.body).toEqual(mockCareerDetail);

      expect(mockCareersService.getPublishedCareerById).toHaveBeenCalledWith(
        careerId,
      );
    });

    it('should return a career without a pathway when no pathway exists', async () => {
      const careerWithoutPathway = {
        ...mockCareerDetail,
        pathway: null,
      };

      mockCareersService.getPublishedCareerById.mockResolvedValueOnce(
        careerWithoutPathway,
      );

      const careerId = '123e4567-e89b-12d3-a456-426614174000';

      const response = await request(app.getHttpServer())
        .get(`/careers/${careerId}`)
        .expect(200);

      expect(response.body.pathway).toBeNull();

      expect(mockCareersService.getPublishedCareerById).toHaveBeenCalledWith(
        careerId,
      );
    });

    it('should reject an invalid career UUID', async () => {
      await request(app.getHttpServer()).get('/careers/not-a-uuid').expect(400);

      expect(mockCareersService.getPublishedCareerById).not.toHaveBeenCalled();
    });
  });

  describe('GET /careers/:careerId/pathway', () => {
    const careerId = '123e4567-e89b-12d3-a456-426614174000';

    const mockPathwayResponse = {
      pathway: {
        id: 'pathway-1',
        careerId,
        title: 'Backend Roadmap',
        description: 'From fundamentals to production APIs.',
        steps: [
          {
            id: 'step-1',
            title: 'Learn TypeScript',
            description: null,
            learningObjective: 'Use TypeScript basics.',
            prerequisites: null,
            expectedActivity: 'Complete an exercise.',
            order: 1,
            skills: [{ id: 'skill-ts', name: 'TypeScript' }],
            resources: [],
          },
        ],
      },
    };

    it('should return 200 OK with the ordered pathway', async () => {
      mockCareersService.getCareerPathway.mockResolvedValue(
        mockPathwayResponse,
      );

      const response = await request(app.getHttpServer())
        .get(`/careers/${careerId}/pathway`)
        .expect(200);

      expect(response.body).toEqual(mockPathwayResponse);
      expect(mockCareersService.getCareerPathway).toHaveBeenCalledWith(
        careerId,
      );
    });

    it('should return { pathway: null } when the career has no pathway yet', async () => {
      mockCareersService.getCareerPathway.mockResolvedValue({ pathway: null });

      const response = await request(app.getHttpServer())
        .get(`/careers/${careerId}/pathway`)
        .expect(200);

      expect(response.body).toEqual({ pathway: null });
    });

    it('should return 404 when the career does not exist or is not published', async () => {
      mockCareersService.getCareerPathway.mockRejectedValue(
        new NotFoundException('Career not found'),
      );

      await request(app.getHttpServer())
        .get(`/careers/${careerId}/pathway`)
        .expect(404);
    });

    it('should reject an invalid career UUID', async () => {
      await request(app.getHttpServer())
        .get('/careers/not-a-uuid/pathway')
        .expect(400);

      expect(mockCareersService.getCareerPathway).not.toHaveBeenCalled();
    });
  });
});
