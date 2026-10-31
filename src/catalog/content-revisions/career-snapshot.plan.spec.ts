import {
  type BuildPlanInput,
  type LiveCareerForPlan,
} from './career-snapshot.types';
import { buildPlan } from './career-snapshot.plan';
import {
  CAREER_SNAPSHOT_SCHEMA_VERSION,
  type CareerSnapshot,
} from './career-snapshot.types';

const liveBase = (): LiveCareerForPlan => ({
  id: 'career-1',
  version: 3,
  title: 'Frontend Engineer',
  slug: 'frontend-engineer',
  description: 'Build UIs',
  roleSummary: 'Frontend dev',
  fieldId: 'field-1',
  targetLevels: ['STUDENT'],
  exampleActivities: ['Code'],
  typicalEducationNote: null,
  certificationsNote: null,
  skills: [{ skillId: 'skill-1', importance: 'REQUIRED' }],
  outlook: [],
  pathway: { id: 'pathway-1', title: 'Path', description: null },
  steps: [
    {
      id: 'step-1',
      order: 1,
      title: 'HTML',
      description: null,
      learningObjective: 'lo',
      prerequisites: null,
      expectedActivity: 'ea',
      skills: [],
      resources: [],
    },
  ],
  resources: [],
});

const snapBase = (): CareerSnapshot => ({
  schemaVersion: CAREER_SNAPSHOT_SCHEMA_VERSION,
  career: {
    title: 'Frontend Engineer',
    slug: 'frontend-engineer',
    description: 'Build UIs',
    roleSummary: 'Frontend dev',
    fieldId: 'field-1',
    targetLevels: ['STUDENT'],
    exampleActivities: ['Code'],
    typicalEducationNote: null,
    certificationsNote: null,
  },
  pathway: { title: 'Path', description: null },
  steps: [
    {
      id: 'step-1',
      order: 1,
      title: 'HTML',
      description: null,
      learningObjective: 'lo',
      prerequisites: null,
      expectedActivity: 'ea',
      skillIds: [],
      resourceIds: [],
    },
  ],
  skills: [{ skillId: 'skill-1', importance: 'REQUIRED' }],
  outlook: [],
  resources: [],
});

const build = (overrides: Partial<BuildPlanInput> = {}) =>
  buildPlan({
    liveCareer: liveBase(),
    snapshot: snapBase(),
    baseVersion: 3,
    ...overrides,
  });

describe('buildPlan', () => {
  it('returns zero operations and no blockers for identical input', () => {
    const plan = build();

    expect(plan.operations).toEqual([]);
    expect(plan.blockers).toEqual([]);
    expect(plan.stale).toBe(false);
    expect(plan.counts).toEqual({
      added: 0,
      changed: 0,
      moved: 0,
      removed: 0,
      blockers: 0,
    });
  });

  it('reports a career field change as a single update operation', () => {
    const snapshot = snapBase();
    snapshot.career.title = 'Senior Frontend Engineer';

    const plan = build({ snapshot });

    expect(plan.operations).toHaveLength(1);
    expect(plan.operations[0]).toEqual({
      kind: 'update',
      section: 'career',
      entityId: 'career-1',
      field: 'title',
      before: 'Frontend Engineer',
      after: 'Senior Frontend Engineer',
    });
  });

  it('reports an added step with a temp id as a create', () => {
    const snapshot = snapBase();
    snapshot.steps.push({
      id: 'new-1',
      order: 2,
      title: 'CSS',
      description: null,
      learningObjective: 'lo',
      prerequisites: null,
      expectedActivity: 'ea',
      skillIds: [],
      resourceIds: [],
    });

    const plan = build({ snapshot });

    const create = plan.operations.find(
      (op) => op.section === 'steps' && op.kind === 'create',
    );
    expect(create).toEqual(
      expect.objectContaining({ entityId: 'new-1', kind: 'create' }),
    );
  });

  it('reports a step rename matched by id as an update', () => {
    const snapshot = snapBase();
    snapshot.steps[0].title = 'HTML5';

    const plan = build({ snapshot });

    expect(plan.operations).toEqual([
      {
        kind: 'update',
        section: 'steps',
        entityId: 'step-1',
        field: 'title',
        before: 'HTML',
        after: 'HTML5',
      },
    ]);
  });

  it('reports a step reorder as a move', () => {
    const snapshot = snapBase();
    snapshot.steps[0].order = 5;

    const plan = build({ snapshot });

    expect(plan.operations).toEqual([
      {
        kind: 'move',
        section: 'steps',
        entityId: 'step-1',
        before: 1,
        after: 5,
      },
    ]);
    expect(plan.counts.moved).toBe(1);
  });

  it('blocks removal of a step with learners', () => {
    const snapshot = snapBase();
    snapshot.steps = [
      {
        id: 'new-1',
        order: 1,
        title: 'CSS',
        description: null,
        learningObjective: 'lo',
        prerequisites: null,
        expectedActivity: 'ea',
        skillIds: [],
        resourceIds: [],
      },
    ];

    const plan = build({
      snapshot,
      stepLearnerCounts: { 'step-1': 7 },
    });

    expect(plan.blockers).toContainEqual({
      code: 'STEP_HAS_PROGRESS',
      message: expect.stringContaining('7 learners'),
      section: 'steps',
      entityId: 'step-1',
      entityTitle: 'HTML',
      learnersAffected: 7,
    });
    expect(
      plan.operations.find(
        (op) => op.section === 'steps' && op.kind === 'delete',
      ),
    ).toBeUndefined();
  });

  it('allows removal of a step with no learners', () => {
    const snapshot = snapBase();
    snapshot.steps = [
      {
        id: 'new-1',
        order: 1,
        title: 'CSS',
        description: null,
        learningObjective: 'lo',
        prerequisites: null,
        expectedActivity: 'ea',
        skillIds: [],
        resourceIds: [],
      },
    ];

    const plan = build({
      snapshot,
      stepLearnerCounts: { 'step-1': 0 },
    });

    expect(plan.blockers).toEqual([]);
    expect(
      plan.operations.find(
        (op) => op.section === 'steps' && op.kind === 'delete',
      ),
    ).toBeDefined();
  });

  it('reports added and removed skills', () => {
    const snapshot = snapBase();
    snapshot.skills = [{ skillId: 'skill-2', importance: 'NICE_TO_HAVE' }];

    const plan = build({ snapshot });

    const unlink = plan.operations.find(
      (op) => op.section === 'skills' && op.kind === 'unlink',
    );
    const link = plan.operations.find(
      (op) => op.section === 'skills' && op.kind === 'link',
    );
    expect(unlink).toMatchObject({ entityId: 'skill-1' });
    expect(link).toMatchObject({ entityId: 'skill-2' });
  });

  it('reports an outlook field change', () => {
    const liveCareer = liveBase();
    liveCareer.outlook = [
      {
        id: 'outlook-1',
        type: 'SALARY',
        geography: 'US',
        period: '2024',
        sourceId: null,
        median: { toString: () => '100000.00' },
        percentile25: null,
        percentile75: null,
        currency: 'USD',
        payPeriod: 'year',
        grossOrNet: 'gross',
        experienceLevel: null,
        baseYear: null,
        baseValue: null,
        projectedYear: null,
        projectedValue: null,
        growthPercent: null,
        demandLevel: null,
      },
    ];

    const snapshot = snapBase();
    snapshot.outlook = [
      {
        id: 'outlook-1',
        type: 'SALARY',
        geography: 'US',
        period: '2024',
        sourceId: null,
        median: '110000.00',
        percentile25: null,
        percentile75: null,
        currency: 'USD',
        payPeriod: 'year',
        grossOrNet: 'gross',
        experienceLevel: null,
        baseYear: null,
        baseValue: null,
        projectedYear: null,
        projectedValue: null,
        growthPercent: null,
        demandLevel: null,
      },
    ];

    const plan = build({ liveCareer, snapshot });

    expect(plan.operations).toEqual([
      expect.objectContaining({
        kind: 'update',
        section: 'outlook',
        entityId: 'outlook-1',
      }),
    ]);
  });

  it('reports stale when baseVersion differs from live version', () => {
    expect(build({ baseVersion: 3 }).stale).toBe(false);
    expect(build({ baseVersion: 2 }).stale).toBe(true);
  });

  it('blocks publication when skills are empty', () => {
    const snapshot = snapBase();
    snapshot.skills = [];

    const plan = build({ snapshot });

    expect(plan.blockers).toContainEqual(
      expect.objectContaining({ code: 'NO_SKILLS', section: 'skills' }),
    );
  });

  it('blocks publication when steps are empty', () => {
    const snapshot = snapBase();
    snapshot.steps = [];

    const plan = build({ snapshot, stepLearnerCounts: {} });

    expect(plan.blockers).toContainEqual(
      expect.objectContaining({ code: 'NO_PATHWAY_STEPS' }),
    );
  });

  it('blocks publication when a required career field is missing', () => {
    const snapshot = snapBase();
    snapshot.career.title = '';

    const plan = build({ snapshot });

    expect(plan.blockers).toContainEqual(
      expect.objectContaining({
        code: 'MISSING_CAREER_FIELD',
        message: expect.stringContaining('title'),
      }),
    );
  });

  it('counts operations by kind', () => {
    const snapshot = snapBase();
    snapshot.career.title = 'Senior Frontend Engineer';
    snapshot.steps[0].title = 'HTML5';
    snapshot.steps[0].order = 2;

    const plan = build({ snapshot });

    expect(plan.counts.changed).toBe(2);
    expect(plan.counts.moved).toBe(1);
    expect(plan.counts.added).toBe(0);
    expect(plan.counts.removed).toBe(0);
    expect(plan.counts.blockers).toBe(0);
  });
});
