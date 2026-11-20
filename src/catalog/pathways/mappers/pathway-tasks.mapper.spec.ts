import {
  PathwayStepStatus,
  ResourceCostStatus,
  ResourceType,
} from '../../../generated/prisma/client';
import {
  type PathwayTasksStageRow,
  type TaskDetailRow,
  type TaskItemRow,
  taskIdsOf,
  toPathwayTaskDetail,
  toPathwayTasks,
} from './pathway-tasks.mapper';

const completedAt = new Date('2026-11-19T10:00:00.000Z');
const checkedAt = new Date('2026-11-18T09:00:00.000Z');

const task = (id: string, checklistItems: number): TaskItemRow => ({
  id,
  title: `Task ${id}`,
  goal: 'Build it',
  estimatedWeeks: 1,
  _count: { checklistItems },
});

const stages: PathwayTasksStageRow[] = [
  {
    id: 'stage-1',
    title: 'Stage A',
    order: 1,
    quiz: null,
    steps: [
      {
        id: 'step-1',
        title: 'Step 1',
        order: 1,
        tasks: [task('task-1', 3), task('task-2', 0)],
      },
      { id: 'step-2', title: 'Step 2', order: 2, tasks: [] },
    ],
  },
];

describe('toPathwayTasks', () => {
  const result = toPathwayTasks(
    'pathway-1',
    stages,
    [
      {
        pathwayStepId: 'step-1',
        status: PathwayStepStatus.COMPLETED,
        completedAt,
      },
    ],
    [{ item: { taskId: 'task-1' } }, { item: { taskId: 'task-1' } }],
    new Map([['task-1', completedAt]]),
  );
  const [step1, step2] = result.stages[0].steps;

  it('groups tasks under their step with the step status', () => {
    expect(result.pathwayId).toBe('pathway-1');
    expect(step1).toMatchObject({
      id: 'step-1',
      status: PathwayStepStatus.COMPLETED,
      completedAt,
    });
    expect(step1.tasks.map(({ id }) => id)).toEqual(['task-1', 'task-2']);
  });

  it('counts checklist ticks and totals per task', () => {
    expect(step1.tasks[0]).toEqual({
      id: 'task-1',
      title: 'Task task-1',
      goal: 'Build it',
      estimatedWeeks: 1,
      isCompleted: true,
      completedAt,
      checklistChecked: 2,
      checklistTotal: 3,
    });
  });

  it('returns zero counts for a task with no checklist', () => {
    expect(step1.tasks[1]).toMatchObject({
      isCompleted: false,
      completedAt: null,
      checklistChecked: 0,
      checklistTotal: 0,
    });
  });

  it('returns an empty list for a step with no tasks', () => {
    expect(step2.tasks).toEqual([]);
  });

  it('never carries hints or checklist items', () => {
    expect(step1.tasks[0]).not.toHaveProperty('hints');
    expect(step1.tasks[0]).not.toHaveProperty('checklist');
  });
});

describe('taskIdsOf', () => {
  it('lists every task in the stages', () => {
    expect(taskIdsOf(stages)).toEqual(['task-1', 'task-2']);
  });
});

describe('toPathwayTaskDetail', () => {
  const detail = (overrides: Partial<TaskDetailRow> = {}): TaskDetailRow => ({
    ...task('task-1', 2),
    stepId: 'step-1',
    whatToMake: ['A request helper'],
    hints: ['Start with GET'],
    checklistItems: [
      { id: 'item-1', text: 'Handle errors', userChecks: [{ checkedAt }] },
      { id: 'item-2', text: 'Add types', userChecks: [] },
    ],
    resources: [
      {
        resource: {
          id: 'resource-1',
          title: 'Handbook',
          provider: 'Example',
          type: ResourceType.ARTICLE,
          costStatus: ResourceCostStatus.FREE,
          url: 'https://example.com',
        },
      },
    ],
    ...overrides,
  });

  it('adds what to make, hints, the checklist and the helpful links', () => {
    expect(toPathwayTaskDetail(detail(), new Map())).toEqual({
      id: 'task-1',
      title: 'Task task-1',
      goal: 'Build it',
      estimatedWeeks: 1,
      isCompleted: false,
      completedAt: null,
      checklistChecked: 1,
      checklistTotal: 2,
      stepId: 'step-1',
      whatToMake: ['A request helper'],
      hints: ['Start with GET'],
      checklist: [
        { id: 'item-1', text: 'Handle errors', isChecked: true, checkedAt },
        {
          id: 'item-2',
          text: 'Add types',
          isChecked: false,
          checkedAt: null,
        },
      ],
      helpfulLinks: [
        {
          id: 'resource-1',
          title: 'Handbook',
          provider: 'Example',
          type: ResourceType.ARTICLE,
          costStatus: ResourceCostStatus.FREE,
          url: 'https://example.com',
        },
      ],
    });
  });

  it('returns empty lists for a task with no checklist or links', () => {
    const result = toPathwayTaskDetail(
      detail({
        _count: { checklistItems: 0 },
        checklistItems: [],
        resources: [],
      }),
      new Map([['task-1', completedAt]]),
    );

    expect(result).toMatchObject({
      isCompleted: true,
      completedAt,
      checklistChecked: 0,
      checklistTotal: 0,
      checklist: [],
      helpfulLinks: [],
    });
  });
});
