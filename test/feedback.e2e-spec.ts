import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { INestApplication, Logger } from '@nestjs/common';
import { getOptionsToken } from '@nestjs/throttler';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { apiPrefix as resolveApiPrefix, configureApp } from '../src/common';
import { throttlerOptionsFactory } from '../src/common/throttler';
import { EnvironmentVariables } from '../src/config';
import { PrismaService } from '../src/prisma';

const FEEDBACK_LIMIT = 3;

describe('Feedback (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let apiPrefix: string;
  let careerId: string;
  let fieldId: string;

  const timestamp = Date.now();
  const marker = `e2e-feedback-${timestamp}`;
  const feedbackUrl = () => `${apiPrefix}/feedback`;

  const createApp = async (feedbackLimit?: number) => {
    let builder = Test.createTestingModule({ imports: [AppModule] });
    if (feedbackLimit !== undefined) {
      builder = builder.overrideProvider(getOptionsToken()).useFactory({
        inject: [ConfigService],
        factory: (config: ConfigService<EnvironmentVariables, true>) =>
          throttlerOptionsFactory({
            get: (key: keyof EnvironmentVariables) =>
              key === 'THROTTLE_FEEDBACK_LIMIT'
                ? feedbackLimit
                : config.get(key, { infer: true }),
          } as ConfigService<EnvironmentVariables, true>),
      });
    }
    const moduleFixture: TestingModule = await builder.compile();
    const created = moduleFixture.createNestApplication();
    configureApp(created);
    await created.init();
    return created;
  };

  beforeAll(async () => {
    app = await createApp();
    apiPrefix = `/${resolveApiPrefix(
      app.get<ConfigService<EnvironmentVariables, true>>(ConfigService),
    )}`;

    prisma = app.get(PrismaService);
    const field = await prisma.field.create({
      data: { name: `Feedback Field ${timestamp}`, slug: `${marker}-field` },
    });
    fieldId = field.id;
    const career = await prisma.career.create({
      data: {
        slug: `${marker}-career`,
        title: `Feedback Career ${timestamp}`,
        description: 'd',
        roleSummary: 'r',
        exampleActivities: [],
        fieldId,
      },
    });
    careerId = career.id;
  });

  afterAll(async () => {
    await prisma.contentFeedback.deleteMany({
      where: { description: { startsWith: marker } },
    });
    await prisma.career.deleteMany({ where: { id: careerId } });
    await prisma.field.deleteMany({ where: { id: fieldId } });
    await app.close();
  });

  const post = (body: Record<string, unknown>, target = app) =>
    request(target.getHttpServer()).post(feedbackUrl()).send(body);

  describe('POST /feedback', () => {
    it('stores anonymous feedback and returns 201 without internal ids', async () => {
      const response = await post({
        category: 'BROKEN_LINK',
        description: `${marker} step link is dead`,
        section: 'RESOURCES',
        careerId,
        userEmail: ' Ada@Example.com ',
        platform: 'WEB',
      }).expect(201);

      expect(response.body).toEqual({ message: 'Feedback received' });

      const saved = await prisma.contentFeedback.findMany({
        where: { description: `${marker} step link is dead` },
      });
      expect(saved).toHaveLength(1);
      expect(saved[0]).toMatchObject({
        category: 'BROKEN_LINK',
        section: 'RESOURCES',
        careerId,
        userEmail: 'ada@example.com',
        platform: 'WEB',
        status: 'NEW',
      });
    });

    it('defaults section to GENERAL and needs no careerId for it', async () => {
      await post({
        category: 'OTHER',
        description: `${marker} minimal`,
      }).expect(201);

      const saved = await prisma.contentFeedback.findFirstOrThrow({
        where: { description: `${marker} minimal` },
      });
      expect(saved).toMatchObject({ section: 'GENERAL', careerId: null });
    });

    it('writes the contact email and description to no log line', async () => {
      let output: string;
      const levels = ['log', 'error', 'warn', 'debug', 'verbose'] as const;
      const spies = levels.map((level) =>
        jest.spyOn(Logger.prototype, level).mockImplementation(() => undefined),
      );
      try {
        await post({
          category: 'USABILITY',
          description: `${marker} private details`,
          userEmail: 'private.person@example.com',
        }).expect(201);
        await post({
          category: 'USABILITY',
          description: `${marker} bad email`,
          userEmail: 'private.person@',
        }).expect(400);
        output = JSON.stringify(spies.map((spy) => spy.mock.calls));
      } finally {
        spies.forEach((spy) => spy.mockRestore());
      }

      expect(output).toContain('Feedback submitted');
      expect(output).not.toContain('private.person');
      expect(output).not.toContain(`${marker} private details`);
    });

    it('treats a blank userEmail as no email', async () => {
      await post({
        category: 'OTHER',
        description: `${marker} blank email`,
        userEmail: '  ',
      }).expect(201);

      const saved = await prisma.contentFeedback.findFirstOrThrow({
        where: { description: `${marker} blank email` },
      });
      expect(saved.userEmail).toBeNull();
    });

    it('returns 400 and saves nothing when careerId matches no career', async () => {
      const response = await post({
        category: 'INCORRECT_CONTENT',
        section: 'OUTLOOK',
        description: `${marker} unknown career`,
        careerId: '00000000-0000-4000-8000-000000000000',
      }).expect(400);

      expect(response.body).toMatchObject({
        error: 'BAD_REQUEST',
        message: 'Career not found',
      });
      expect(
        await prisma.contentFeedback.count({
          where: { description: `${marker} unknown career` },
        }),
      ).toBe(0);
    });

    it('returns 400 on careerId when a non-GENERAL section has no careerId', async () => {
      const response = await post({
        category: 'BROKEN_LINK',
        section: 'PATHWAY',
        description: 'x',
      }).expect(400);

      expect(response.body).toMatchObject({
        error: 'VALIDATION_ERROR',
        fields: {
          careerId: 'is required when section is not GENERAL',
        },
      });
    });

    it.each([
      [
        'an unknown category',
        { category: 'CONTENT', description: 'x' },
        'category',
      ],
      ['a missing category', { description: 'x' }, 'category'],
      [
        'an unknown section',
        { category: 'OTHER', section: 'FOOTER', description: 'x' },
        'section',
      ],
      [
        'a null section',
        { category: 'OTHER', section: null, description: 'x' },
        'section',
      ],
      [
        'an unknown platform',
        { category: 'OTHER', platform: 'MOBILE', description: 'x' },
        'platform',
      ],
      [
        'a malformed email',
        { category: 'OTHER', description: 'x', userEmail: 'not-an-email' },
        'userEmail',
      ],
      [
        'a blank description',
        { category: 'OTHER', description: '   ' },
        'description',
      ],
      [
        'an oversized description',
        { category: 'OTHER', description: 'x'.repeat(2001) },
        'description',
      ],
      [
        'a careerId that is not a UUID',
        { category: 'OTHER', description: 'x', careerId: 'career-1' },
        'careerId',
      ],
    ])('returns 400 VALIDATION_ERROR for %s', async (_label, body, field) => {
      const response = await post(body).expect(400);

      expect(response.body.error).toBe('VALIDATION_ERROR');
      expect(response.body.fields).toHaveProperty(field);
    });

    it(`returns 429 after ${FEEDBACK_LIMIT} submissions from one client in a window`, async () => {
      const limited = await createApp(FEEDBACK_LIMIT);
      try {
        for (let i = 0; i < FEEDBACK_LIMIT; i++) {
          await post(
            { category: 'OTHER', description: `${marker} burst ${i}` },
            limited,
          ).expect(201);
        }

        const response = await post(
          { category: 'OTHER', description: `${marker} burst over` },
          limited,
        ).expect(429);

        expect(response.body.error).toBe('TOO_MANY_REQUESTS');
      } finally {
        await limited.close();
      }
    });
  });
});
