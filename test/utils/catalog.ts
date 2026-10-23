import { PrismaService } from '../../src/prisma';
import { CareerStatus } from '../../src/generated/prisma/client';

export interface CatalogFixture {
  fieldId: string;
  careerIds: string[];
  publishedCareerId: string;
  secondPublishedCareerId: string;
  draftCareerId: string;
  retiredCareerId: string;
}

export const seedCatalog = async (
  prisma: PrismaService,
  opts: { suffix?: string } = {},
): Promise<CatalogFixture> => {
  const suffix = opts.suffix ?? `${Date.now()}`;

  const field = await prisma.field.create({
    data: {
      name: `E2E Field ${suffix}`,
      slug: `e2e-field-${suffix}`,
    },
  });

  const careerIds: string[] = [];

  const makeCareer = async (status: CareerStatus, tag: string) => {
    const career = await prisma.career.create({
      data: {
        slug: `e2e-career-${tag}-${suffix}`,
        title: `Career ${tag} ${suffix}`,
        description: 'd',
        roleSummary: 'r',
        exampleActivities: [],
        fieldId: field.id,
        status,
        ...(status === CareerStatus.PUBLISHED
          ? { publishedAt: new Date() }
          : {}),
        pathway: {
          create: {
            title: `Pathway ${tag}`,
            steps: {
              create: [1, 2, 3].map((order) => ({
                title: `Step ${order}`,
                learningObjective: 'lo',
                expectedActivity: 'ea',
                order,
              })),
            },
          },
        },
      },
    });
    careerIds.push(career.id);
    return career.id;
  };

  const publishedCareerId = await makeCareer(CareerStatus.PUBLISHED, 'a');
  const secondPublishedCareerId = await makeCareer(CareerStatus.PUBLISHED, 'b');
  const draftCareerId = await makeCareer(CareerStatus.DRAFT, 'd');
  const retiredCareerId = await makeCareer(CareerStatus.RETIRED, 'r');

  return {
    fieldId: field.id,
    careerIds,
    publishedCareerId,
    secondPublishedCareerId,
    draftCareerId,
    retiredCareerId,
  };
};

export const cleanupCatalog = async (
  prisma: PrismaService,
  fixture: CatalogFixture,
) => {
  await prisma.career.deleteMany({ where: { id: { in: fixture.careerIds } } });
  if (fixture.fieldId) {
    await prisma.field
      .delete({ where: { id: fixture.fieldId } })
      .catch(() => {});
  }
};

export const stepsOf = (prisma: PrismaService, careerId: string) =>
  prisma.pathwayStep.findMany({
    where: { pathway: { careerId } },
    orderBy: { order: 'asc' },
  });
