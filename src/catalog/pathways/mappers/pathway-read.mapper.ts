import {
  CareerStatus,
  PathwayStepStatus,
  ResourceCostStatus,
  ResourceType,
} from '../../../generated/prisma/client';
import type { PathwayReadDto } from '../dto/pathway-read.dto';
import {
  computeNextStep,
  computePathwayProgress,
  computeStageProgress,
  computeStepStatuses,
  type StageForProgress,
  type UserStepProgress,
} from '../progress';
import { toStageQuizStatus } from '../stage-quiz-status';

// Outline: everything the service loads in query 1 (no resources or tasks).
export interface PathwayReadRow {
  id: string;
  career: {
    id: string;
    title: string;
    description: string | null;
    status: CareerStatus;
    _count: { resources: number };
  };
  _count: { steps: number; stages: number };
  stages: Array<{
    id: string;
    title: string;
    description: string | null;
    order: number;
    quiz: {
      id: string;
      attempts: Array<{ correct: number; total: number }>;
    } | null;
    steps: Array<{
      id: string;
      title: string;
      order: number;
      description: string | null;
      learningObjective: string;
      expectedActivity: string;
      skills: Array<{ skill: { name: string } }>;
    }>;
  }>;
}

// Heavy data: loaded in query 2, only for the active steps.
export interface HeavyStepData {
  resources: Array<{
    resource: {
      id: string;
      title: string;
      url: string;
      type: ResourceType;
      costStatus: ResourceCostStatus;
      estimatedWeeks: number | null;
      provider: string;
    };
  }>;
  tasks: Array<{
    id: string;
    title: string;
    goal: string;
    estimatedWeeks: number | null;
    whatToMake: string[];
    hints: string[];
    checklistItems: Array<{ text: string }>;
  }>;
}

export interface PathwayReadOptions {
  userId: string | null;
  startStepId: string | null;
}

export function toStagesForProgress(
  stages: PathwayReadRow['stages'],
): StageForProgress[] {
  return stages.map((s) => ({
    id: s.id,
    order: s.order,
    steps: s.steps.map((step) => ({ id: step.id, order: step.order })),
  }));
}

/**
 * Decides which steps get heavy data: the next step, plus the start step if set.
 * Used by the service (to know what to fetch) and by the mapper (to know what
 * to show), so both always agree.
 */
export function resolveActiveStepIds(
  stages: StageForProgress[],
  userSteps: UserStepProgress[],
  opts: PathwayReadOptions,
): { nextStepId: string | null; activeStepIds: Set<string> } {
  const signedIn = opts.userId !== null;

  const nextStepId = signedIn
    ? computePathwayProgress(stages, userSteps, opts.startStepId).nextStepId
    : computeNextStep(stages, [], opts.startStepId);

  const activeStepIds = new Set<string>();
  if (nextStepId) activeStepIds.add(nextStepId);
  if (opts.startStepId) activeStepIds.add(opts.startStepId);

  return { nextStepId, activeStepIds };
}

export function toPathwayRead(
  row: PathwayReadRow,
  userSteps: UserStepProgress[],
  opts: PathwayReadOptions,
  heavyByStepId: Map<string, HeavyStepData>,
): PathwayReadDto {
  const signedIn = opts.userId !== null;
  const stagesForProgress = toStagesForProgress(row.stages);
  const { activeStepIds } = resolveActiveStepIds(
    stagesForProgress,
    userSteps,
    opts,
  );

  const progress = signedIn
    ? computePathwayProgress(stagesForProgress, userSteps, opts.startStepId)
    : null;

  const orderedStages = [...row.stages].sort((a, b) => a.order - b.order);

  return {
    id: row.id,
    career: {
      id: row.career.id,
      title: row.career.title,
      description: row.career.description,
      retired: row.career.status === CareerStatus.RETIRED,
      stageCount: row._count.stages,
      stepCount: row._count.steps,
      resourceCount: row.career._count.resources,
    },
    progress,
    stages: orderedStages.map((stage) => {
      const stageSteps = [...stage.steps].sort((a, b) => a.order - b.order);
      const statuses = computeStepStatuses(stageSteps, userSteps);
      const attempt = stage.quiz?.attempts[0] ?? null;

      return {
        id: stage.id,
        title: stage.title,
        description: stage.description,
        order: stage.order,
        progress: signedIn ? computeStageProgress(stageSteps, userSteps) : null,
        quiz: toStageQuizStatus(
          stage.quiz ? { id: stage.quiz.id } : null,
          attempt,
        ),
        steps: stageSteps.map((step) => {
          const heavy = activeStepIds.has(step.id)
            ? heavyByStepId.get(step.id)
            : undefined;

          return {
            id: step.id,
            title: step.title,
            order: step.order,
            status: signedIn
              ? (statuses.get(step.id) ?? PathwayStepStatus.NOT_STARTED)
              : null,
            description: step.description,
            expectedActivity: step.expectedActivity,
            careerReadiness: step.learningObjective,
            skills: step.skills.map((s) => s.skill.name),

            resources: heavy
              ? heavy.resources.map(({ resource }) => ({
                  id: resource.id,
                  title: resource.title,
                  url: resource.url,
                  type: resource.type,
                  costStatus: resource.costStatus,
                  estimatedWeeks: resource.estimatedWeeks,
                  provider: resource.provider,
                }))
              : [],

            tasks: heavy
              ? heavy.tasks.map((task) => ({
                  id: task.id,
                  title: task.title,
                  goal: task.goal,
                  estimatedWeeks: task.estimatedWeeks,
                  whatToMake: task.whatToMake,
                  hints: task.hints,
                  checklist: task.checklistItems.map((c) => c.text),
                }))
              : [],
          };
        }),
      };
    }),
  };
}
