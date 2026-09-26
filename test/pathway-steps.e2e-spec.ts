import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PathwayStepsService } from '../src/catalog/pathway-steps';
import { apiPrefix as resolveApiPrefix, configureApp } from '../src/common';
import { EnvironmentVariables } from '../src/config';

describe('Pathway steps (e2e)', () => {
  let app: INestApplication;
  let apiPrefix: string;

  const stepId = '123e4567-e89b-12d3-a456-426614174010';

  const mockStepDetail = {
    id: stepId,
    pathwayId: 'pathway-1',
    careerId: 'career-1',
    title: 'Build an API',
    description: null,
    learningObjective: 'Build a REST API.',
    prerequisites: 'TypeScript basics.',
    expectedActivity: 'Build a CRUD API.',
    order: 2,
    skills: [{ id: 'skill-nest', name: 'NestJS' }],
    resources: [
      {
        id: 'resource-1',
        title: 'NestJS Docs',
        description: null,
        url: 'https://nestjs.com',
        type: 'ARTICLE',
        provider: 'NestJS',
        costStatus: 'FREE',
        certificationCost: null,
        curationRationale: 'Official documentation.',
        lastCheckedDate: '2026-01-01T00:00:00.000Z',
        skills: [{ id: 'skill-nest', name: 'NestJS' }],
      },
    ],
  };

  const mockPathwayStepsService = {
    getPathwayStepById: jest.fn(),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PathwayStepsService)
      .useValue(mockPathwayStepsService)
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

  describe('GET /pathway-steps/:stepId', () => {
    it('should return 200 OK with the step, its skills and nested resources', async () => {
      mockPathwayStepsService.getPathwayStepById.mockResolvedValue(
        mockStepDetail,
      );

      const response = await request(app.getHttpServer())
        .get(`${apiPrefix}/pathway-steps/${stepId}`)
        .expect(200);

      expect(response.body).toEqual(mockStepDetail);
      expect(mockPathwayStepsService.getPathwayStepById).toHaveBeenCalledWith(
        stepId,
      );
    });

    it('should return 404 when the step does not exist or its career is not published', async () => {
      mockPathwayStepsService.getPathwayStepById.mockRejectedValue(
        new NotFoundException('Pathway step not found'),
      );

      const response = await request(app.getHttpServer())
        .get(`${apiPrefix}/pathway-steps/${stepId}`)
        .expect(404);

      expect(response.body).toEqual(
        expect.objectContaining({
          statusCode: 404,
          error: 'NOT_FOUND',
          message: 'Pathway step not found',
        }),
      );
    });

    it('should reject an invalid step UUID', async () => {
      await request(app.getHttpServer())
        .get(`${apiPrefix}/pathway-steps/not-a-uuid`)
        .expect(400);

      expect(mockPathwayStepsService.getPathwayStepById).not.toHaveBeenCalled();
    });
  });
});
