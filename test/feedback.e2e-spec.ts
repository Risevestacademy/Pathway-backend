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
import {
  CareerStatus,
  ResourceStatus,
  ResourceType,
} from '../src/generated/prisma/client';

const FEEDBACK_LIMIT = 3;
const UNKNOWN_ID = '00000000-0000-4000-8000-000000000000';

describe('Feedback (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let apiPrefix: string;
  let careerId: string;
  let draftCareerId: string;
  let fieldId: string;
  let pathwayId: string;
  let stepId: string;
  let courseId: string;
  let certificationId: string;
  let withdrawnResourceId: string;

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
    await created.listen(0, '127.0.0.1');
    return created;
  };

  const createResource = (
    label: string,
    type: ResourceType,
    status: ResourceStatus,
  ) =>
    prisma.resource.create({
      data: {
        title: `${marker} ${label}`,
        url: `https://example.com/${marker}/${label}`,
        type,
        provider: 'Example',
        curationRationale: 'r',
        lastCheckedDate: new Date(),
        status,
      },
    });

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
        status: CareerStatus.PUBLISHED,
        publishedAt: new Date(),
        pathway: {
          create: {
            title: `${marker} pathway`,
            steps: {
              create: [
                {
                  title: `${marker} step`,
                  learningObjective: 'lo',
                  expectedActivity: 'ea',
                  order: 1,
                },
              ],
            },
          },
        },
      },
    });
    careerId = career.id;
    pathwayId = (await prisma.pathway.findFirstOrThrow({ where: { careerId } }))
      .id;
    stepId = (
      await prisma.pathwayStep.findFirstOrThrow({ where: { pathwayId } })
    ).id;

    // Reports about a draft career must not be accepted: it is not visible.
    draftCareerId = (
      await prisma.career.create({
        data: {
          slug: `${marker}-draft`,
          title: `Feedback Draft Career ${timestamp}`,
          description: 'd',
          roleSummary: 'r',
          exampleActivities: [],
          fieldId,
          status: CareerStatus.DRAFT,
        },
      })
    ).id;

    courseId = (
      await createResource('course', ResourceType.COURSE, ResourceStatus.ACTIVE)
    ).id;
    certificationId = (
      await createResource(
        'certification',
        ResourceType.CERTIFICATION,
        ResourceStatus.ACTIVE,
      )
    ).id;
    withdrawnResourceId = (
      await createResource(
        'withdrawn',
        ResourceType.COURSE,
        ResourceStatus.WITHDRAWN,
      )
    ).id;
  });

  afterAll(async () => {
    await prisma.contentFeedback.deleteMany({
      where: { description: { startsWith: marker } },
    });
    await prisma.resource.deleteMany({
      where: { title: { startsWith: marker } },
    });
    await prisma.career.deleteMany({
      where: { id: { in: [careerId, draftCareerId] } },
    });
    await prisma.field.deleteMany({ where: { id: fieldId } });
    await app.close();
  });

  const post = (body: Record<string, unknown>, target = app) =>
    request(target.getHttpServer()).post(feedbackUrl()).send(body);

  const countSaved = (description: string) =>
    prisma.contentFeedback.count({ where: { description } });

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
        targetType: 'CAREER',
        targetId: careerId,
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
      expect(saved).toMatchObject({
        section: 'GENERAL',
        careerId: null,
        targetType: 'OTHER',
        targetId: null,
      });
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

    it('returns 400 when a context careerId matches no career', async () => {
      const response = await post({
        category: 'INCORRECT_CONTENT',
        section: 'OUTLOOK',
        description: `${marker} unknown context career`,
        targetType: 'OTHER',
        careerId: UNKNOWN_ID,
      }).expect(400);

      expect(response.body).toMatchObject({
        error: 'BAD_REQUEST',
        message: 'Career not found',
      });
      expect(await countSaved(`${marker} unknown context career`)).toBe(0);
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
      [
        'an unknown targetType',
        { category: 'OTHER', description: 'x', targetType: 'TOPIC' },
        'targetType',
      ],
      [
        'a null targetType',
        { category: 'OTHER', description: 'x', targetType: null },
        'targetType',
      ],
      [
        'a targetId that is not a UUID',
        {
          category: 'OTHER',
          description: 'x',
          targetType: 'RESOURCE',
          targetId: 'resource-1',
        },
        'targetId',
      ],
      [
        'a targetType that needs an id but has none',
        { category: 'OTHER', description: 'x', targetType: 'PATHWAY_STEP' },
        'targetId',
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

  describe('POST /feedback targets', () => {
    const targets: [string, string, () => string][] = [
      ['CAREER', 'career', () => careerId],
      ['PATHWAY', 'pathway', () => pathwayId],
      ['PATHWAY_STEP', 'step', () => stepId],
      ['RESOURCE', 'resource', () => courseId],
      ['CERTIFICATION', 'certification', () => certificationId],
    ];

    it.each(targets)(
      'returns 201 for a %s target that exists and stores it',
      async (targetType, label, id) => {
        const description = `${marker} target ${label}`;

        await post({
          category: 'INCORRECT_CONTENT',
          description,
          targetType,
          targetId: id(),
        }).expect(201);

        const saved = await prisma.contentFeedback.findFirstOrThrow({
          where: { description },
        });
        expect(saved).toMatchObject({ targetType, targetId: id() });
      },
    );

    it('accepts a non-GENERAL section with a target and no careerId', async () => {
      await post({
        category: 'BROKEN_LINK',
        section: 'RESOURCES',
        description: `${marker} section with target`,
        targetType: 'RESOURCE',
        targetId: courseId,
      }).expect(201);
    });

    it('keeps a careerId sent as context next to the target', async () => {
      const description = `${marker} context career`;

      await post({
        category: 'BROKEN_LINK',
        section: 'PATHWAY',
        description,
        careerId,
        targetType: 'PATHWAY_STEP',
        targetId: stepId,
      }).expect(201);

      const saved = await prisma.contentFeedback.findFirstOrThrow({
        where: { description },
      });
      expect(saved).toMatchObject({
        careerId,
        targetType: 'PATHWAY_STEP',
        targetId: stepId,
      });
    });

    it('returns 201 for OTHER without a targetId and stores no target id', async () => {
      const description = `${marker} other without id`;

      await post({
        category: 'OTHER',
        description,
        targetType: 'OTHER',
      }).expect(201);

      const saved = await prisma.contentFeedback.findFirstOrThrow({
        where: { description },
      });
      expect(saved).toMatchObject({ targetType: 'OTHER', targetId: null });
    });

    it('ignores a targetId sent with OTHER', async () => {
      const description = `${marker} other with id`;

      await post({
        category: 'OTHER',
        description,
        targetType: 'OTHER',
        targetId: courseId,
      }).expect(201);

      const saved = await prisma.contentFeedback.findFirstOrThrow({
        where: { description },
      });
      expect(saved.targetId).toBeNull();
    });

    it.each([
      ['an unknown career', 'CAREER', () => UNKNOWN_ID],
      ['a draft career', 'CAREER', () => draftCareerId],
      ['an unknown pathway', 'PATHWAY', () => UNKNOWN_ID],
      ['an unknown step', 'PATHWAY_STEP', () => UNKNOWN_ID],
      ['a withdrawn resource', 'RESOURCE', () => withdrawnResourceId],
      [
        'a resource that is not a certification',
        'CERTIFICATION',
        () => courseId,
      ],
      ['an unknown certification', 'CERTIFICATION', () => UNKNOWN_ID],
    ])(
      'returns 404 and stores nothing for %s',
      async (label, targetType, id) => {
        const description = `${marker} missing ${label}`;

        const response = await post({
          category: 'BROKEN_LINK',
          description,
          targetType,
          targetId: id(),
        }).expect(404);

        expect(response.body).toMatchObject({
          error: 'NOT_FOUND',
          message: 'Target not found',
        });
        expect(await countSaved(description)).toBe(0);
      },
    );

    it('returns 404 for a careerId on its own that matches no visible career', async () => {
      const description = `${marker} legacy unknown career`;

      const response = await post({
        category: 'INCORRECT_CONTENT',
        section: 'OUTLOOK',
        description,
        careerId: UNKNOWN_ID,
      }).expect(404);

      expect(response.body).toMatchObject({
        error: 'NOT_FOUND',
        message: 'Target not found',
      });
      expect(await countSaved(description)).toBe(0);
    });
  });
});
