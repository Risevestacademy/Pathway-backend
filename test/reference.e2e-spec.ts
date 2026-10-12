import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { ReferenceService } from '../src/reference';
import { apiPrefix as resolveApiPrefix, configureApp } from '../src/common';
import { EnvironmentVariables } from '../src/config';

describe('Onboarding options (e2e)', () => {
  let app: INestApplication;
  let apiPrefix: string;

  const mockOptions = {
    educationLevels: [
      { value: 'BACHELOR', label: "Bachelor's degree" },
      { value: 'MASTERS', label: "Master's degree" },
    ],
    internshipOptions: [
      { value: 'NONE', label: 'None' },
      { value: 'THREE_PLUS', label: '3+' },
    ],
    experienceOptions: [
      { value: 'ZERO', label: 'None yet' },
      { value: 'THREE_PLUS', label: '3+ years' },
    ],
    skills: [{ id: 's1', name: 'TypeScript', description: null }],
    fields: [{ id: 'f1', name: 'Software', slug: 'software' }],
  };

  const mockReferenceService = {
    getOnboardingOptions: jest.fn(),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(ReferenceService)
      .useValue(mockReferenceService)
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

  describe('GET /onboarding/options', () => {
    it('should return 200 with all five option groups in order', async () => {
      mockReferenceService.getOnboardingOptions.mockResolvedValue(mockOptions);

      const response = await request(app.getHttpServer())
        .get(`${apiPrefix}/onboarding/options`)
        .expect(200);

      expect(Object.keys(response.body)).toEqual([
        'educationLevels',
        'internshipOptions',
        'experienceOptions',
        'skills',
        'fields',
      ]);
      expect(response.body).toEqual(mockOptions);
    });

    it('every option entry is a { value, label } pair with a label', async () => {
      mockReferenceService.getOnboardingOptions.mockResolvedValue(mockOptions);

      const response = await request(app.getHttpServer())
        .get(`${apiPrefix}/onboarding/options`)
        .expect(200);

      for (const key of [
        'educationLevels',
        'internshipOptions',
        'experienceOptions',
      ]) {
        for (const option of response.body[key]) {
          expect(option).toHaveProperty('value');
          expect(option).toHaveProperty('label');
          expect(option.label).toBeTruthy();
        }
      }
    });

    it('does not require authentication', async () => {
      mockReferenceService.getOnboardingOptions.mockResolvedValue(mockOptions);

      await request(app.getHttpServer())
        .get(`${apiPrefix}/onboarding/options`)
        .expect(200);

      expect(mockReferenceService.getOnboardingOptions).toHaveBeenCalled();
    });

    it('is unaffected by an invalid Authorization header (still 200)', async () => {
      mockReferenceService.getOnboardingOptions.mockResolvedValue(mockOptions);

      await request(app.getHttpServer())
        .get(`${apiPrefix}/onboarding/options`)
        .set('Authorization', 'Bearer not-a-token')
        .expect(200);
    });
  });
});
