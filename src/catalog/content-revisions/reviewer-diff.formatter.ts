import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma';
import type {
  CareerPlan,
  PlanOperation,
  PlanSection,
} from './career-snapshot.plan';
import type { CareerSnapshot } from './career-snapshot.types';
import {
  type AdvisoryDto,
  type FieldChangeDto,
  type MovedStepDto,
  type ReviewerDiffResponseDto,
  type SectionChangesDto,
  type StepChangeDto,
} from './dto/reviewer-diff-response.dto';

const SECTION_LABELS: Record<PlanSection, string> = {
  career: 'Career Details',
  pathway: 'Pathway',
  steps: 'Pathway Steps',
  stepSkills: 'Step Skills',
  stepResources: 'Step Resources',
  skills: 'Career Skills',
  outlook: 'Outlook & Salary',
  resources: 'Resources',
};

const FIELD_LABELS: Record<string, string> = {
  // Career
  title: 'Title',
  slug: 'Slug',
  description: 'Description',
  roleSummary: 'Role Summary',
  fieldId: 'Category',
  typicalEducationNote: 'Typical Education',
  certificationsNote: 'Certifications',
  targetLevels: 'Target Levels',
  exampleActivities: 'Example Activities',
  // Pathway
  // (title and description already covered by career labels)
  // Steps
  learningObjective: 'Learning Objective',
  prerequisites: 'Prerequisites',
  expectedActivity: 'Expected Activity',
  order: 'Position',
  // Outlook
  type: 'Outlook Type',
  geography: 'Geography',
  period: 'Period',
  sourceId: 'Source',
  median: 'Typical Starting Salary',
  percentile25: '25th Percentile',
  percentile75: '75th Percentile',
  currency: 'Currency',
  payPeriod: 'Pay Period',
  grossOrNet: 'Gross or Net',
  experienceLevel: 'Experience Level',
  baseYear: 'Base Year',
  baseValue: 'Base Value',
  projectedYear: 'Projected Year',
  projectedValue: 'Projected Value',
  growthPercent: 'Growth Percentage',
  demandLevel: 'Demand Level',
  // Resources
  url: 'URL',
  provider: 'Provider',
  costStatus: 'Cost Status',
  certificationCost: 'Certification Cost',
  curationRationale: 'Curation Rationale',
  lastCheckedDate: 'Last Checked',
};

const labelFor = (section: PlanSection, field: string): string =>
  FIELD_LABELS[field] ?? field;

const titleFor = (op: PlanOperation, side: 'before' | 'after'): string => {
  const value = side === 'before' ? op.before : op.after;
  if (value && typeof value === 'object' && 'title' in value) {
    return String((value as { title: unknown }).title);
  }
  return op.entityId ?? 'Unknown';
};

export interface RevisionMeta {
  title: string;
  authorName: string;
  createdAt: Date;
}

@Injectable()
export class ReviewerDiffFormatter {
  constructor(private readonly prisma: PrismaService) {}

  async format(
    revisionId: string,
    plan: CareerPlan,
    snapshot: CareerSnapshot,
    meta: RevisionMeta,
  ): Promise<ReviewerDiffResponseDto> {
    const sections = this.groupOperations(plan.operations);

    await this.resolveSourceLabels(sections);

    const advisories = this.generateAdvisories(snapshot);

    return {
      revisionId,
      title: meta.title,
      submittedBy: meta.authorName,
      submittedAt: this.relativeTime(meta.createdAt),
      baseVersion: plan.baseVersion,
      liveVersion: plan.liveVersion,
      stale: plan.stale,
      blockers: plan.blockers,
      advisories,
      sections,
    };
  }

  private groupOperations(
    operations: PlanOperation[],
  ): Record<string, SectionChangesDto> {
    const sections: Record<string, SectionChangesDto> = {};

    const ensure = (section: PlanSection): SectionChangesDto => {
      if (!sections[section]) {
        sections[section] = { changed: [], added: [], removed: [], moved: [] };
      }
      return sections[section];
    };

    for (const op of operations) {
      const bucket = ensure(op.section);

      switch (op.kind) {
        case 'update': {
          const change: FieldChangeDto = {
            field: op.field!,
            label: labelFor(op.section, op.field!),
            before: op.before,
            after: op.after,
          };
          bucket.changed.push(change);
          break;
        }

        case 'create':
        case 'link': {
          const item: StepChangeDto = {
            id: op.entityId!,
            title: titleFor(op, 'after'),
          };
          bucket.added.push(item);
          break;
        }

        case 'delete':
        case 'unlink': {
          const item: StepChangeDto = {
            id: op.entityId!,
            title: titleFor(op, 'before'),
          };
          bucket.removed.push(item);
          break;
        }

        case 'move': {
          const item: MovedStepDto = {
            id: op.entityId!,
            title: titleFor(op, 'after'),
            fromOrder: op.before as number,
            toOrder: op.after as number,
          };
          bucket.moved.push(item);
          break;
        }
      }
    }

    // Strip empty sections so the frontend doesn't render empty cards
    for (const [key, section] of Object.entries(sections)) {
      const isEmpty =
        section.changed.length === 0 &&
        section.added.length === 0 &&
        section.removed.length === 0 &&
        section.moved.length === 0;
      if (isEmpty) delete sections[key];
    }

    return sections;
  }

  /**
   * For any outlook change whose field is `sourceId`, fetch the Source
   * names so the UI can render "Jobberman 2025" instead of a UUID. The raw
   * UUID stays in `before`/`after` so logging and debugging still work.
   */
  private async resolveSourceLabels(
    sections: Record<string, SectionChangesDto>,
  ): Promise<void> {
    const sourceIds = new Set<string>();

    for (const change of sections['outlook']?.changed ?? []) {
      if (change.field !== 'sourceId') continue;
      if (typeof change.before === 'string') sourceIds.add(change.before);
      if (typeof change.after === 'string') sourceIds.add(change.after);
    }

    if (sourceIds.size === 0) return;

    const sources = await this.prisma.source.findMany({
      where: { id: { in: [...sourceIds] } },
      select: { id: true, name: true },
    });
    const map = new Map(sources.map((s) => [s.id, s.name]));

    for (const change of sections['outlook']?.changed ?? []) {
      if (change.field !== 'sourceId') continue;
      if (typeof change.before === 'string') {
        change.beforeLabel = map.get(change.before) ?? 'Unknown source';
      }
      if (typeof change.after === 'string') {
        change.afterLabel = map.get(change.after) ?? 'Unknown source';
      }
    }
  }

  /**
   * Advisory rules are not yet implemented. This is the plumbing: the
   * formatter returns an empty array today, and specific rules
   * (e.g. "source date is in the future") can be added here without
   * touching the response shape.
   */
  private generateAdvisories(snapshot: CareerSnapshot): AdvisoryDto[] {
    void snapshot;
    return [];
  }

  private relativeTime(date: Date): string {
    const diffMs = Date.now() - date.getTime();
    const minutes = Math.floor(diffMs / 60000);
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes} min ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
    const days = Math.floor(hours / 24);
    return `${days} day${days === 1 ? '' : 's'} ago`;
  }
}

// re-export so the DTO file doesn't need SECTION_LABELS imported
export { SECTION_LABELS, FIELD_LABELS };
