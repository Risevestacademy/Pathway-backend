import { PrismaService } from '../../src/prisma';
import { CareerStatus } from '../../src/generated/prisma/client';

export interface CatalogFixture {
  fieldId: string;
  careerIds: string[];

  publishedCareerId: string;
  publishedPathwayId: string;
  firstStageId: string;
  firstStepId: string;
  secondStepId: string;
  thirdStepId: string;
  stageQuizId: string;

  secondPublishedCareerId: string;

  draftCareerId: string;
  draftPathwayId: string;

  retiredCareerId: string;
  retiredPathwayId: string;
}

interface SeededPathway {
  pathwayId: string;
  firstStageId: string;
  steps: [string, string, string];
  stageQuizId: string;
}

// Two stages. Steps 1 and 2 sit in stage A, step 3 in stage B.
// Step 1 has a resource and a task. Stage A has a quiz with one question.
const seedPathway = async (
  prisma: PrismaService,
  careerId: string,
  tag: string,
): Promise<SeededPathway> => {
  const pathway = await prisma.pathway.create({
    data: { careerId, title: `Pathway ${tag}` },
  });

  const stageA = await prisma.pathwayStage.create({
    data: {
      pathwayId: pathway.id,
      title: `Stage A ${tag}`,
      description: 'Stage A description',
      order: 1,
    },
  });

  const stageB = await prisma.pathwayStage.create({
    data: {
      pathwayId: pathway.id,
      title: `Stage B ${tag}`,
      description: 'Stage B description',
      order: 2,
    },
  });

  const step1 = await prisma.pathwayStep.create({
    data: {
      pathwayId: pathway.id,
      stageId: stageA.id,
      title: 'Step 1',
      learningObjective: 'lo',
      expectedActivity: 'ea',
      order: 1,
    },
  });

  const step2 = await prisma.pathwayStep.create({
    data: {
      pathwayId: pathway.id,
      stageId: stageA.id,
      title: 'Step 2',
      learningObjective: 'lo',
      expectedActivity: 'ea',
      order: 2,
    },
  });

  const step3 = await prisma.pathwayStep.create({
    data: {
      pathwayId: pathway.id,
      stageId: stageB.id,
      title: 'Step 3',
      learningObjective: 'lo',
      expectedActivity: 'ea',
      order: 3,
    },
  });

  const quiz = await prisma.stageQuiz.create({
    data: {
      stageId: stageA.id,
      questions: {
        create: [
          {
            prompt: 'Which option is right?',
            order: 1,
            correctIndex: 2,
            options: {
              create: ['A', 'B', 'C', 'D'].map((text, i) => ({
                text,
                order: i,
              })),
            },
          },
        ],
      },
    },
  });

  await prisma.resource.create({
    data: {
      title: `Resource ${tag}`,
      url: 'https://example.com/resource',
      type: 'ARTICLE',
      provider: 'Example',
      curationRationale: 'Useful for the step',
      lastCheckedDate: new Date(),
      pathwaySteps: { create: [{ pathwayStepId: step1.id }] },
    },
  });

  await prisma.pathwayStepTask.create({
    data: {
      stepId: step1.id,
      title: `Task ${tag}`,
      goal: 'Build something',
      order: 1,
      whatToMake: ['A page'],
      hints: ['Start small'],
      checklistItems: {
        create: [{ text: 'Check one thing', order: 1 }],
      },
    },
  });

  return {
    pathwayId: pathway.id,
    firstStageId: stageA.id,
    steps: [step1.id, step2.id, step3.id],
    stageQuizId: quiz.id,
  };
};

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
      },
    });
    careerIds.push(career.id);
    const pathway = await seedPathway(prisma, career.id, tag);
    return { careerId: career.id, ...pathway };
  };

  const published = await makeCareer(CareerStatus.PUBLISHED, 'a');
  const second = await makeCareer(CareerStatus.PUBLISHED, 'b');
  const draft = await makeCareer(CareerStatus.DRAFT, 'd');
  const retired = await makeCareer(CareerStatus.RETIRED, 'r');

  return {
    fieldId: field.id,
    careerIds,

    publishedCareerId: published.careerId,
    publishedPathwayId: published.pathwayId,
    firstStageId: published.firstStageId,
    firstStepId: published.steps[0],
    secondStepId: published.steps[1],
    thirdStepId: published.steps[2],
    stageQuizId: published.stageQuizId,

    secondPublishedCareerId: second.careerId,

    draftCareerId: draft.careerId,
    draftPathwayId: draft.pathwayId,

    retiredCareerId: retired.careerId,
    retiredPathwayId: retired.pathwayId,
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
