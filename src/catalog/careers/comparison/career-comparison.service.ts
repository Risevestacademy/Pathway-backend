import { Injectable, NotFoundException } from '@nestjs/common';
import {
  CareerStatus,
  OutlookType,
  Prisma,
  SkillImportance,
} from '../../../generated/prisma/client';
import { PrismaService } from '../../../prisma';
import { CareerOverviewSkillDto } from '../dto/career-overview.dto';
import { OutlookItemDto } from '../dto/career-projection.dto';
import {
  careerOverviewSelect,
  careerProjectionSelect,
  toCareerOverview,
  toCareerProjection,
} from '../mappers/career.mappers';
import {
  CareerComparisonDto,
  ComparedCareerDto,
  ComparisonDemandDto,
  ComparisonSalaryDto,
  ComparisonSourceDto,
  CompareCareersResponseDto,
  OutlookComparabilityDto,
  OutlookMismatchReason,
  SkillMatchDto,
} from './dto/career-comparison.dto';

export const ENTRY_LEVEL = 'entry-level';

export const careerComparisonSelect = {
  ...careerOverviewSelect,
  id: true,
  slug: true,
  iconKey: true,
  targetLevels: true,
  typicalEducationNote: true,
  field: { select: { id: true, name: true, slug: true } },
  pathway: {
    select: {
      steps: {
        select: { id: true, title: true, order: true },
        orderBy: { order: 'asc' as const },
      },
      _count: { select: { stages: true } },
    },
  },
  outlook: {
    ...careerProjectionSelect.outlook,
    include: { source: { select: { name: true, url: true } } },
  },
} satisfies Prisma.CareerSelect;

export type CareerComparisonRow = Prisma.CareerGetPayload<{
  select: typeof careerComparisonSelect;
}>;

type OutlookCheck<T> = readonly [keyof T, OutlookMismatchReason];

const SALARY_CHECKS: readonly OutlookCheck<ComparisonSalaryDto>[] = [
  ['geography', 'GEOGRAPHY'],
  ['period', 'PERIOD'],
  ['currency', 'CURRENCY'],
  ['payPeriod', 'PAY_PERIOD'],
];

const DEMAND_CHECKS: readonly OutlookCheck<ComparisonDemandDto>[] = [
  ['geography', 'GEOGRAPHY'],
  ['period', 'PERIOD'],
];

const compareOutlook = <T>(
  a: T | null,
  b: T | null,
  checks: readonly OutlookCheck<T>[],
): OutlookComparabilityDto => {
  if (!a || !b) return { comparable: false, reasons: ['MISSING_VALUE'] };

  const reasons = checks
    .filter(([key]) => a[key] !== b[key])
    .map(([, reason]) => reason);
  return { comparable: reasons.length === 0, reasons };
};

const pickSalary = (outlook: OutlookItemDto[]): OutlookItemDto | null => {
  const salaries = outlook.filter(({ type }) => type === OutlookType.SALARY);
  return (
    salaries.find(({ experienceLevel }) => experienceLevel === ENTRY_LEVEL) ??
    salaries[0] ??
    null
  );
};

const pickDemand = (outlook: OutlookItemDto[]): OutlookItemDto | null =>
  outlook.find(({ type }) => type === OutlookType.DEMAND) ?? null;

@Injectable()
export class CareerComparisonService {
  constructor(private readonly prisma: PrismaService) {}

  async compareCareers(
    ids: string[],
    userId?: string,
  ): Promise<CompareCareersResponseDto> {
    const [rows, userSkillIds] = await Promise.all([
      this.prisma.career.findMany({
        where: { id: { in: ids }, status: CareerStatus.PUBLISHED },
        select: careerComparisonSelect,
      }),
      userId ? this.findUserSkillIds(userId) : null,
    ]);

    const byId = new Map(rows.map((row) => [row.id, row]));
    const [careerA, careerB] = ids.map((id) => byId.get(id));
    if (!careerA || !careerB) throw new NotFoundException('Career not found');

    const { careers, outlook } = this.buildComparison(careerA, careerB);

    return {
      careers: careers.map((career) => ({
        ...career,
        skillMatch: userSkillIds
          ? this.computeSkillMatch(career, userSkillIds)
          : null,
      })),
      outlook,
    };
  }

  buildComparison(
    careerA: CareerComparisonRow,
    careerB: CareerComparisonRow,
  ): CareerComparisonDto {
    const a = this.toComparedCareer(careerA);
    const b = this.toComparedCareer(careerB);

    return {
      careers: [a, b],
      outlook: {
        salary: compareOutlook(a.salary, b.salary, SALARY_CHECKS),
        demand: compareOutlook(a.demand, b.demand, DEMAND_CHECKS),
      },
    };
  }

  computeSkillMatch(
    career: { skills: CareerOverviewSkillDto[] },
    userSkillIds: string[],
  ): SkillMatchDto {
    const owned = new Set(userSkillIds);
    const required = career.skills.filter(
      ({ importance }) => importance === SkillImportance.REQUIRED,
    );
    const matchedRequiredSkills = required
      .filter(({ id }) => owned.has(id))
      .map(({ id, name }) => ({ id, name }));

    return {
      matchedRequiredSkills,
      requiredSkillCount: required.length,
      percentage:
        required.length === 0
          ? null
          : Math.round((matchedRequiredSkills.length / required.length) * 100),
      niceToHaveSkills: career.skills
        .filter(({ importance }) => importance === SkillImportance.NICE_TO_HAVE)
        .map(({ id, name }) => ({ id, name, matched: owned.has(id) })),
    };
  }

  private async findUserSkillIds(userId: string): Promise<string[]> {
    const skills = await this.prisma.userSkill.findMany({
      where: { userId },
      select: { skillId: true },
    });
    return skills.map(({ skillId }) => skillId);
  }

  private toComparedCareer(row: CareerComparisonRow): ComparedCareerDto {
    const overview = toCareerOverview(row);
    const outlook = toCareerProjection(row);
    const sources = new Map(row.outlook.map(({ id, source }) => [id, source]));
    const sourceOf = (id: string): ComparisonSourceDto | null =>
      sources.get(id) ?? null;

    const salary = pickSalary(outlook);
    const demand = pickDemand(outlook);
    const firstStep = row.pathway?.steps[0];

    return {
      id: row.id,
      slug: row.slug,
      title: overview.title,
      description: overview.description,
      iconKey: row.iconKey,
      field: row.field,
      roleSummary: overview.roleSummary,
      exampleActivities: overview.exampleActivities,
      targetLevels: row.targetLevels,
      typicalEducationNote: row.typicalEducationNote,
      skills: overview.skills,
      salary: salary && {
        geography: salary.geography,
        period: salary.period,
        experienceLevel: salary.experienceLevel,
        median: salary.median,
        percentile25: salary.percentile25,
        percentile75: salary.percentile75,
        currency: salary.currency,
        payPeriod: salary.payPeriod,
        grossOrNet: salary.grossOrNet,
        source: sourceOf(salary.id),
      },
      demand: demand && {
        geography: demand.geography,
        period: demand.period,
        demandLevel: demand.demandLevel,
        source: sourceOf(demand.id),
      },
      pathway: row.pathway && {
        stepCount: overview.topicCount,
        stageCount: row.pathway._count.stages,
        firstStep: firstStep
          ? { id: firstStep.id, title: firstStep.title }
          : null,
      },
    };
  }
}
