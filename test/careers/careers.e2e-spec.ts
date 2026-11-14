import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { CareersService } from '../../src/catalog/careers';
import { PathwaysService } from '../../src/catalog/careers/pathways/pathways.service';
import { apiPrefix as resolveApiPrefix, configureApp } from '../../src/common';
import { EnvironmentVariables } from '../../src/config';

describe('Careers (e2e)', () => {
  let app: INestApplication;
  let apiPrefix: string;

  const mockCareerCard = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    slug: 'software-engineer',
    title: 'Software Engineer',
    description: 'Builds scalable web applications.',
    iconKey: 'se-icon',
    targetLevels: ['RECENT_GRAD'],
    topicCount: 3,
    resourceCount: 12,
  };

  const mockCareersList = {
    totals: { pathways: 7, topics: 57, resources: 141 },
    items: [mockCareerCard],
  };

  const mockCareerDetail = {
    overview: {
      title: 'Software Engineer',
      description: 'Builds scalable web applications.',
      roleSummary: 'Designs and builds software systems.',
      exampleActivities: ['Write code', 'Review pull requests'],
      imageUrl: 'https://cdn/banner.png',
      skills: [{ id: 'skill-1', name: 'TypeScript', importance: 'REQUIRED' }],
      topicCount: 3,
      resourceCount: 12,
    },
    projection: [
      {
        id: 'outlook-1',
        type: 'SALARY',
        geography: 'United States',
        sourceId: 'src-1',
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
      },
    ],
    requirements: {
      courses: [
        {
          id: 'r1',
          title: 'TypeScript Deep Dive',
          provider: 'Coursera',
          url: 'https://example.com/course',
          costStatus: 'FREE',
          estimatedWeeks: 6,
          badgeImageUrl: null,
        },
      ],
      certifications: [],
    },
  };

  const mockCareersService = {
    getPublicCareers: jest.fn().mockResolvedValue(mockCareersList),
    getPublishedCareerById: jest.fn().mockResolvedValue(mockCareerDetail),
    saveCareer: jest.fn(),
    unsaveCareer: jest.fn(),
  };

  const mockPathwaysService = {
    getCareerPathway: jest.fn(),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(CareersService)
      .useValue(mockCareersService)
      .overrideProvider(PathwaysService)
      .useValue(mockPathwaysService)
      .compile();
    app = moduleFixture.createNestApplication();

    configureApp(app);

    apiPrefix = `/${resolveApiPrefix(
      app.get<ConfigService<EnvironmentVariables, true>>(ConfigService),
    )}`;

    await app.listen(0, '127.0.0.1');
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /careers', () => {
    it('returns 200 with { totals, items } and delegates empty query', async () => {
      const response = await request(app.getHttpServer())
        .get(`${apiPrefix}/careers`)
        .expect(200);

      expect(response.body).toEqual(mockCareersList);
      expect(mockCareersService.getPublicCareers).toHaveBeenCalledWith({});
    });

    it('passes level and interest through to the service', async () => {
      const queryParams = {
        level: 'RECENT_GRAD',
        interest: 'software-engineering',
      };

      await request(app.getHttpServer())
        .get(`${apiPrefix}/careers`)
        .query(queryParams)
        .expect(200);

      expect(mockCareersService.getPublicCareers).toHaveBeenCalledWith(
        expect.objectContaining(queryParams),
      );
    });
  });

  describe('GET /careers/:id', () => {
    const careerId = '123e4567-e89b-12d3-a456-426614174000';

    it('returns 200 with { overview, projection, requirements }', async () => {
      const response = await request(app.getHttpServer())
        .get(`${apiPrefix}/careers/${careerId}`)
        .expect(200);

      expect(response.body).toEqual(mockCareerDetail);
      expect(mockCareersService.getPublishedCareerById).toHaveBeenCalledWith(
        careerId,
      );
    });

    it('propagates a 404 from the service', async () => {
      mockCareersService.getPublishedCareerById.mockRejectedValueOnce(
        new NotFoundException('Career not found'),
      );

      await request(app.getHttpServer())
        .get(`${apiPrefix}/careers/${careerId}`)
        .expect(404);
    });

    it('rejects a malformed UUID with 400 and never calls the service', async () => {
      await request(app.getHttpServer())
        .get(`${apiPrefix}/careers/not-a-uuid`)
        .expect(400);

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

    it('returns 200 with the ordered pathway', async () => {
      mockPathwaysService.getCareerPathway.mockResolvedValue(
        mockPathwayResponse,
      );

      const response = await request(app.getHttpServer())
        .get(`${apiPrefix}/careers/${careerId}/pathway`)
        .expect(200);

      expect(response.body).toEqual(mockPathwayResponse);
      expect(mockPathwaysService.getCareerPathway).toHaveBeenCalledWith(
        careerId,
      );
    });

    it('returns { pathway: null } when the career has no pathway yet', async () => {
      mockPathwaysService.getCareerPathway.mockResolvedValue({ pathway: null });

      const response = await request(app.getHttpServer())
        .get(`${apiPrefix}/careers/${careerId}/pathway`)
        .expect(200);

      expect(response.body).toEqual({ pathway: null });
    });

    it('returns 404 when the career is missing or not PUBLISHED', async () => {
      mockPathwaysService.getCareerPathway.mockRejectedValue(
        new NotFoundException('Career not found'),
      );

      await request(app.getHttpServer())
        .get(`${apiPrefix}/careers/${careerId}/pathway`)
        .expect(404);
    });

    it('rejects a malformed UUID with 400', async () => {
      await request(app.getHttpServer())
        .get(`${apiPrefix}/careers/not-a-uuid/pathway`)
        .expect(400);

      expect(mockPathwaysService.getCareerPathway).not.toHaveBeenCalled();
    });
  });

  describe('GET /careers/:careerId/pathway/steps', () => {
    it('returns 404 in the standard error format', async () => {
      const careerId = '123e4567-e89b-12d3-a456-426614174000';

      const response = await request(app.getHttpServer())
        .get(`${apiPrefix}/careers/${careerId}/pathway/steps`)
        .expect(404);

      expect(response.body).toMatchObject({
        statusCode: 404,
        error: 'NOT_FOUND',
        path: `${apiPrefix}/careers/${careerId}/pathway/steps`,
      });
    });
  });
});
