import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';

import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma';
import { Prisma } from '../src/generated/prisma/client';

describe('ContentFeedback and Career schema (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let fieldId: string;

  const timestamp = Date.now();
  const marker = `e2e-feedback-schema-${timestamp}`;

  const createCareer = (suffix: string, title: string) =>
    prisma.career.create({
      data: {
        slug: `${marker}-${suffix}`,
        title,
        description: 'd',
        roleSummary: 'r',
        exampleActivities: [],
        fieldId,
      },
    });

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);

    const field = await prisma.field.create({
      data: { name: `Feedback Schema Field ${timestamp}`, slug: marker },
    });
    fieldId = field.id;
  });

  afterAll(async () => {
    await prisma.contentFeedback.deleteMany({
      where: { description: { startsWith: marker } },
    });
    await prisma.career.deleteMany({
      where: { slug: { startsWith: marker } },
    });
    await prisma.field.deleteMany({ where: { id: fieldId } });
    await app.close();
  });

  it('rejects a second career with the same title', async () => {
    const title = `Unique Title ${timestamp}`;
    await createCareer('first', title);

    await expect(createCareer('second', title)).rejects.toMatchObject({
      code: 'P2002',
    } satisfies Partial<Prisma.PrismaClientKnownRequestError>);
  });

  it('defaults feedback to status NEW and section GENERAL', async () => {
    const feedback = await prisma.contentFeedback.create({
      data: { category: 'OTHER', description: `${marker} defaults` },
    });

    expect(feedback).toMatchObject({ status: 'NEW', section: 'GENERAL' });
  });

  it('keeps feedback and clears careerId when its career is deleted', async () => {
    const career = await createCareer('deleted', `Deleted Career ${timestamp}`);
    const feedback = await prisma.contentFeedback.create({
      data: {
        category: 'BROKEN_LINK',
        section: 'PATHWAY',
        careerId: career.id,
        description: `${marker} orphaned`,
      },
    });

    await prisma.career.delete({ where: { id: career.id } });

    const after = await prisma.contentFeedback.findUnique({
      where: { id: feedback.id },
    });
    expect(after).not.toBeNull();
    expect(after?.careerId).toBeNull();
  });
});
