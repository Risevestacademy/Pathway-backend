import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PathwaysService } from '../src/catalog/pathways';
import { apiPrefix as resolveApiPrefix, configureApp } from '../src/common';
import { EnvironmentVariables } from '../src/config';

describe('Pathways (e2e)', () => {
  let app: INestApplication;
  let apiPrefix: string;

  const pathwayId = '123e4567-e89b-12d3-a456-426614174020';

  const mockPathwayMetadata = {
    id: pathwayId,
    careerId: 'career-1',
    title: 'Frontend Engineer Pathway',
    description: 'A path to frontend engineering.',
    stepCount: 2,
    steps: [
      { id: 'step-1', title: 'HTML basics', order: 1, description: null },
      {
        id: 'step-2',
        title: 'CSS layout',
        order: 2,
        description: 'Flex and grid.',
      },
    ],
  };

  const mockPathwaysService = {
    getPathwayMetadata: jest.fn(),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PathwaysService)
      .useValue(mockPathwaysService)
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

  const getPathway = (id: string) =>
    request(app.getHttpServer()).get(`${apiPrefix}/pathways/${id}`);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /pathways/:pathwayId', () => {
    it('should return 200 OK with pathway metadata and slim ordered steps', async () => {
      mockPathwaysService.getPathwayMetadata.mockResolvedValue(
        mockPathwayMetadata,
      );

      const response = await getPathway(pathwayId).expect(200);

      expect(response.body).toEqual(mockPathwayMetadata);
      expect(mockPathwaysService.getPathwayMetadata).toHaveBeenCalledWith(
        pathwayId,
      );
    });

    it('should not embed resources, skills, or full step detail', async () => {
      mockPathwaysService.getPathwayMetadata.mockResolvedValue(
        mockPathwayMetadata,
      );

      const response = await getPathway(pathwayId).expect(200);

      expect(Object.keys(response.body).sort()).toEqual(
        ['careerId', 'description', 'id', 'stepCount', 'steps', 'title'].sort(),
      );
      expect(Object.keys(response.body.steps[0]).sort()).toEqual(
        ['description', 'id', 'order', 'title'].sort(),
      );
      expect(response.body.steps[0]).not.toHaveProperty('resources');
      expect(response.body.steps[0]).not.toHaveProperty('skills');
      expect(response.body.steps[0]).not.toHaveProperty('learningObjective');
    });

    it('should return an empty steps array and stepCount 0 when the pathway has no steps', async () => {
      mockPathwaysService.getPathwayMetadata.mockResolvedValue({
        ...mockPathwayMetadata,
        stepCount: 0,
        steps: [],
      });

      const response = await getPathway(pathwayId).expect(200);

      expect(response.body.steps).toEqual([]);
      expect(response.body.stepCount).toBe(0);
    });

    it('should return 404 when the pathway does not exist or its career is not published', async () => {
      mockPathwaysService.getPathwayMetadata.mockRejectedValue(
        new NotFoundException('Pathway not found'),
      );

      const response = await getPathway(pathwayId).expect(404);

      expect(response.body).toEqual(
        expect.objectContaining({
          statusCode: 404,
          error: 'NOT_FOUND',
          message: 'Pathway not found',
        }),
      );
    });

    it('should reject an invalid pathway UUID', async () => {
      await getPathway('not-a-uuid').expect(400);

      expect(mockPathwaysService.getPathwayMetadata).not.toHaveBeenCalled();
    });

    it('should allow unauthenticated access (public endpoint)', async () => {
      mockPathwaysService.getPathwayMetadata.mockResolvedValue(
        mockPathwayMetadata,
      );

      await request(app.getHttpServer())
        .get(`${apiPrefix}/pathways/${pathwayId}`)
        .expect(200);

      expect(mockPathwaysService.getPathwayMetadata).toHaveBeenCalledWith(
        pathwayId,
      );
    });
  });
});
