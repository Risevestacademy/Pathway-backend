import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { SkillsService } from '../src/skills';
import { apiPrefix as resolveApiPrefix, configureApp } from '../src/common';
import { EnvironmentVariables } from '../src/config';

describe('Skills (e2e)', () => {
  let app: INestApplication;
  let apiPrefix: string;

  const mockSkills = [
    {
      id: 'skill-docker',
      name: 'Docker',
      description: 'Packaging applications into portable containers.',
    },
    {
      id: 'skill-git',
      name: 'Git',
      description: 'Version control for tracking and sharing code changes.',
    },
  ];

  const mockSkillsService = {
    getSkills: jest.fn(),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(SkillsService)
      .useValue(mockSkillsService)
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

  describe('GET /skills', () => {
    it('should return 200 OK with all skills to an unauthenticated client', async () => {
      mockSkillsService.getSkills.mockResolvedValue(mockSkills);

      const response = await request(app.getHttpServer())
        .get(`${apiPrefix}/skills`)
        .expect(200);

      expect(response.body).toEqual(mockSkills);
      expect(mockSkillsService.getSkills).toHaveBeenCalledTimes(1);
    });

    it('should return 200 OK with an empty array when there are no skills', async () => {
      mockSkillsService.getSkills.mockResolvedValue([]);

      const response = await request(app.getHttpServer())
        .get(`${apiPrefix}/skills`)
        .expect(200);

      expect(response.body).toEqual([]);
    });
  });
});
