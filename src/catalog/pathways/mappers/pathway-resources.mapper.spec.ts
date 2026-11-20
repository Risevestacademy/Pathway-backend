import {
  PathwayStepStatus,
  ResourceCostStatus,
  ResourceType,
} from '../../../generated/prisma/client';
import {
  type PathwayResourcesStageRow,
  type ResourceItemRow,
  resourceIdsOf,
  toPathwayResourceDetail,
  toPathwayResources,
} from './pathway-resources.mapper';
import type { StepMark } from './learning-stages.mapper';

const lastCheckedDate = new Date('2026-11-01T00:00:00.000Z');
const completedAt = new Date('2026-11-19T10:00:00.000Z');

const resource = (id: string, overrides: Partial<ResourceItemRow> = {}) => ({
  id,
  title: `Resource ${id}`,
  provider: 'Example',
  type: ResourceType.ARTICLE,
  costStatus: ResourceCostStatus.FREE,
  estimatedWeeks: 1,
  lastCheckedDate,
  ...overrides,
});

const stages: PathwayResourcesStageRow[] = [
  {
    id: 'stage-2',
    title: 'Stage B',
    order: 2,
    quiz: null,
    steps: [{ id: 'step-3', title: 'Step 3', order: 3, resources: [] }],
  },
  {
    id: 'stage-1',
    title: 'Stage A',
    order: 1,
    quiz: { id: 'quiz-1', attempts: [] },
    steps: [
      {
        id: 'step-2',
        title: 'Step 2',
        order: 2,
        resources: [{ resource: resource('r-shared') }],
      },
      {
        id: 'step-1',
        title: 'Step 1',
        order: 1,
        resources: [
          { resource: resource('r-1') },
          { resource: resource('r-shared') },
        ],
      },
    ],
  },
];

const marks: StepMark[] = [
  {
    pathwayStepId: 'step-1',
    status: PathwayStepStatus.COMPLETED,
    completedAt,
  },
];

describe('toPathwayResources', () => {
  const result = toPathwayResources(
    'pathway-1',
    stages,
    marks,
    [resource('course-1', { type: ResourceType.COURSE })],
    new Map([['r-shared', completedAt]]),
  );

  it('orders stages and steps', () => {
    expect(result.stages.map(({ id }) => id)).toEqual(['stage-1', 'stage-2']);
    expect(result.stages[0].steps.map(({ id }) => id)).toEqual([
      'step-1',
      'step-2',
    ]);
  });

  it('counts stage progress from the step marks', () => {
    expect(result.stages[0].progress).toEqual({
      completed: 1,
      total: 2,
      percentage: 50,
    });
    expect(result.stages[1].progress).toEqual({
      completed: 0,
      total: 1,
      percentage: 0,
    });
  });

  it('gives each step its status and completion time', () => {
    const [step1, step2] = result.stages[0].steps;

    expect(step1).toMatchObject({
      status: PathwayStepStatus.COMPLETED,
      completedAt,
    });
    expect(step2).toMatchObject({
      status: PathwayStepStatus.NOT_STARTED,
      completedAt: null,
    });
  });

  it('marks a resource completed in every step that uses it', () => {
    const [step1, step2] = result.stages[0].steps;

    expect(step1.resources).toEqual([
      expect.objectContaining({
        id: 'r-1',
        isCompleted: false,
        completedAt: null,
      }),
      expect.objectContaining({
        id: 'r-shared',
        isCompleted: true,
        completedAt,
      }),
    ]);
    expect(step2.resources[0]).toMatchObject({
      id: 'r-shared',
      isCompleted: true,
    });
  });

  it('returns an empty list for a step with no resources', () => {
    expect(result.stages[1].steps[0].resources).toEqual([]);
  });

  it('reports the quiz status, or null without a quiz', () => {
    expect(result.stages[0].quiz).toEqual({ status: 'NOT_TAKEN' });
    expect(result.stages[1].quiz).toBeNull();
  });

  it('maps the optional paid courses', () => {
    expect(result.optionalPaidCourses).toEqual([
      {
        id: 'course-1',
        title: 'Resource course-1',
        provider: 'Example',
        type: ResourceType.COURSE,
        costStatus: ResourceCostStatus.FREE,
        estimatedWeeks: 1,
        lastCheckedDate,
        isCompleted: false,
        completedAt: null,
      },
    ]);
  });
});

describe('resourceIdsOf', () => {
  it('lists each step resource and optional course once', () => {
    expect(resourceIdsOf(stages, [resource('course-1')])).toEqual([
      'r-shared',
      'r-1',
      'course-1',
    ]);
  });
});

describe('toPathwayResourceDetail', () => {
  it('adds the description, outcomes, link, usage note and next task', () => {
    const nextTask = {
      id: 'task-1',
      title: 'Task',
      goal: 'Build',
      estimatedWeeks: null,
    };

    expect(
      toPathwayResourceDetail(
        {
          ...resource('r-1'),
          description: 'About it',
          outcomes: ['Write types'],
          url: 'https://example.com',
        },
        new Map(),
        'Read chapter 2',
        nextTask,
      ),
    ).toEqual({
      ...resource('r-1'),
      isCompleted: false,
      completedAt: null,
      description: 'About it',
      outcomes: ['Write types'],
      url: 'https://example.com',
      usageNote: 'Read chapter 2',
      nextTask,
    });
  });
});
