import { jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { SkillsAssessmentService } from './skills-assessment.service';
import { PrismaService } from '../prisma';
import { UserSkillStatus } from '../generated/prisma/client';
import { DomainException } from '../common';

interface GetAssessmentUserPathwayRow {
  careerId: string;
  career: {
    pathway: {
      id: string;
      stages: Array<{
        id: string;
        title: string;
        order: number;
        steps: Array<{
          id: string;
          skills: Array<{ skill: { id: string; name: string } }>;
        }>;
      }>;
    } | null;
  };
}

interface SaveUserPathwayRow {
  careerId: string;
  startStepId: string | null;
  career: { pathway: { id: string } | null };
}

describe('SkillsAssessmentService', () => {
  let service: SkillsAssessmentService;

  const mockPrisma = {
    userPathway: {
      findFirst: jest.fn<() => Promise<unknown>>(),
      update: jest.fn<() => Promise<unknown>>(),
    },
    pathwayStep: {
      findMany: jest.fn<() => Promise<unknown>>(),
    },
    pathwayStepSkill: {
      findMany: jest.fn<() => Promise<unknown>>(),
    },
    userSkill: {
      findMany: jest.fn<() => Promise<unknown>>(),
      upsert: jest.fn<(args: unknown) => Promise<unknown>>(),
      updateMany: jest.fn<(args: unknown) => Promise<unknown>>(),
      deleteMany: jest.fn<(args: unknown) => Promise<unknown>>(),
    },
    userSkillProgress: {
      createMany: jest.fn<() => Promise<unknown>>(),
      deleteMany: jest.fn<() => Promise<unknown>>(),
    },
    userPathwayStep: {
      create: jest.fn<() => Promise<unknown>>(),
      createMany: jest.fn<() => Promise<unknown>>(),
      upsert: jest.fn<() => Promise<unknown>>(),
      update: jest.fn<() => Promise<unknown>>(),
      updateMany: jest.fn<() => Promise<unknown>>(),
    },
    $transaction: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    mockPrisma.$transaction.mockImplementation(
      async (cb: (tx: typeof mockPrisma) => Promise<unknown>) => cb(mockPrisma),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SkillsAssessmentService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<SkillsAssessmentService>(SkillsAssessmentService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getAssessment', () => {
    it('throws NO_ACTIVE_PATHWAY when there is no active pathway', async () => {
      mockPrisma.userPathway.findFirst.mockResolvedValue(null);

      await expect(service.getAssessment('user-1')).rejects.toThrow(
        new NotFoundException('NO_ACTIVE_PATHWAY'),
      );
    });

    it('throws NO_ACTIVE_PATHWAY when the career has no pathway', async () => {
      const row: GetAssessmentUserPathwayRow = {
        careerId: 'career-1',
        career: { pathway: null },
      };
      mockPrisma.userPathway.findFirst.mockResolvedValue(row);

      await expect(service.getAssessment('user-1')).rejects.toThrow(
        new NotFoundException('NO_ACTIVE_PATHWAY'),
      );
    });

    it('defaults unassessed skills to NOT_SURE / null', async () => {
      const row: GetAssessmentUserPathwayRow = {
        careerId: 'career-1',
        career: {
          pathway: {
            id: 'pathway-1',
            stages: [
              {
                id: 'stage-1',
                title: 'Core',
                order: 1,
                steps: [
                  {
                    id: 'step-1',
                    skills: [{ skill: { id: 'skill-a', name: 'A' } }],
                  },
                ],
              },
            ],
          },
        },
      };
      mockPrisma.userPathway.findFirst.mockResolvedValue(row);
      mockPrisma.userSkill.findMany.mockResolvedValue([]);

      const result = await service.getAssessment('user-1');

      expect(result.stages[0].skills).toEqual([
        {
          skillId: 'skill-a',
          skillName: 'A',
          status: UserSkillStatus.NOT_SURE,
          rating: null,
          assessedAt: null,
        },
      ]);
      expect(result.lastAssessedAt).toBeNull();
    });

    it('returns saved status, rating and assessment date for pre-fill', async () => {
      const row: GetAssessmentUserPathwayRow = {
        careerId: 'career-1',
        career: {
          pathway: {
            id: 'pathway-1',
            stages: [
              {
                id: 'stage-1',
                title: 'Core',
                order: 1,
                steps: [
                  {
                    id: 'step-1',
                    skills: [{ skill: { id: 'skill-a', name: 'A' } }],
                  },
                ],
              },
            ],
          },
        },
      };
      mockPrisma.userPathway.findFirst.mockResolvedValue(row);
      mockPrisma.userSkill.findMany.mockResolvedValue([
        {
          skillId: 'skill-a',
          status: UserSkillStatus.HAVE,
          rating: 4,
          assessedAt: new Date('2026-11-20T10:00:00.000Z'),
        },
      ]);

      const result = await service.getAssessment('user-1');

      expect(result.stages[0].skills[0]).toEqual({
        skillId: 'skill-a',
        skillName: 'A',
        status: UserSkillStatus.HAVE,
        rating: 4,
        assessedAt: new Date('2026-11-20T10:00:00.000Z'),
      });
    });

    it('returns the latest assessment date across the pathway skills', async () => {
      const earlier = new Date('2026-11-18T10:00:00.000Z');
      const latest = new Date('2026-11-20T10:00:00.000Z');
      const skill = (id: string) => ({ skill: { id, name: id } });
      const row: GetAssessmentUserPathwayRow = {
        careerId: 'career-1',
        career: {
          pathway: {
            id: 'pathway-1',
            stages: [
              {
                id: 'stage-1',
                title: 'Core',
                order: 1,
                steps: [
                  {
                    id: 'step-1',
                    skills: ['a', 'b', 'c', 'd'].map(skill),
                  },
                ],
              },
            ],
          },
        },
      };
      const saved = (skillId: string, assessedAt: Date | null) => ({
        skillId,
        status: UserSkillStatus.NOT_SURE,
        rating: null,
        assessedAt,
      });
      mockPrisma.userPathway.findFirst.mockResolvedValue(row);
      mockPrisma.userSkill.findMany.mockResolvedValue([
        saved('a', earlier),
        saved('b', latest),
        saved('c', null),
      ]);

      const result = await service.getAssessment('user-1');

      expect(result.lastAssessedAt).toEqual(latest);
      expect(result.stages[0].skills.map((s) => s.assessedAt)).toEqual([
        earlier,
        latest,
        null,
        null,
      ]);
    });

    it('returns no assessment date when only profile rows are saved', async () => {
      const row: GetAssessmentUserPathwayRow = {
        careerId: 'career-1',
        career: {
          pathway: {
            id: 'pathway-1',
            stages: [
              {
                id: 'stage-1',
                title: 'Core',
                order: 1,
                steps: [
                  {
                    id: 'step-1',
                    skills: [{ skill: { id: 'skill-a', name: 'A' } }],
                  },
                ],
              },
            ],
          },
        },
      };
      mockPrisma.userPathway.findFirst.mockResolvedValue(row);
      mockPrisma.userSkill.findMany.mockResolvedValue([
        {
          skillId: 'skill-a',
          status: UserSkillStatus.NOT_SURE,
          rating: null,
          assessedAt: null,
        },
      ]);

      const result = await service.getAssessment('user-1');

      expect(result.lastAssessedAt).toBeNull();
    });

    it('dedupes a skill taught by two steps, keeping the earlier stage', async () => {
      const row: GetAssessmentUserPathwayRow = {
        careerId: 'career-1',
        career: {
          pathway: {
            id: 'pathway-1',
            stages: [
              {
                id: 'stage-1',
                title: 'First',
                order: 1,
                steps: [
                  {
                    id: 'step-1',
                    skills: [{ skill: { id: 'skill-a', name: 'A' } }],
                  },
                ],
              },
              {
                id: 'stage-2',
                title: 'Second',
                order: 2,
                steps: [
                  {
                    id: 'step-2',
                    skills: [{ skill: { id: 'skill-a', name: 'A' } }],
                  },
                ],
              },
            ],
          },
        },
      };
      mockPrisma.userPathway.findFirst.mockResolvedValue(row);
      mockPrisma.userSkill.findMany.mockResolvedValue([]);

      const result = await service.getAssessment('user-1');

      expect(result.stages[0].skills).toHaveLength(1);
      expect(result.stages[1].skills).toHaveLength(0);
    });
  });

  describe('saveAssessment', () => {
    const buildSaveRow = (startStepId: string | null): SaveUserPathwayRow => ({
      careerId: 'career-1',
      startStepId,
      career: { pathway: { id: 'pathway-1' } },
    });

    const buildStep = (id: string, order: number, skillIds: string[]) => ({
      id,
      title: `Step ${order}`,
      description: `Description for step ${order}`,
      order,
      skills: skillIds.map((skillId) => ({
        skillId,
        skill: { name: `Name of ${skillId}` },
      })),
    });

    it('throws UNKNOWN_SKILL_IN_PATHWAY before any write when a skillId is invalid', async () => {
      mockPrisma.userPathway.findFirst.mockResolvedValue(buildSaveRow(null));
      mockPrisma.pathwayStep.findMany.mockResolvedValue([
        buildStep('step-1', 1, ['skill-a']),
      ]);

      await expect(
        service.saveAssessment('user-1', {
          skills: [
            {
              skillId: '00000000-0000-0000-0000-000000000000',
              status: UserSkillStatus.HAVE,
              rating: 4,
            },
          ],
        }),
      ).rejects.toThrow(DomainException);

      expect(mockPrisma.userSkill.upsert).not.toHaveBeenCalled();
      expect(mockPrisma.userSkillProgress.createMany).not.toHaveBeenCalled();
    });

    it('upserts each skill and writes no progress row on a no-op transition', async () => {
      mockPrisma.userPathway.findFirst.mockResolvedValue(buildSaveRow(null));
      mockPrisma.pathwayStep.findMany.mockResolvedValue([
        buildStep('step-1', 1, ['skill-a']),
      ]);
      mockPrisma.userSkill.findMany
        .mockResolvedValueOnce([
          {
            id: 'us-1',
            skillId: 'skill-a',
            status: UserSkillStatus.HAVE,
            rating: 4,
          },
        ])
        .mockResolvedValueOnce([
          { skillId: 'skill-a', status: UserSkillStatus.HAVE },
        ]);
      mockPrisma.userSkill.upsert.mockResolvedValue({ id: 'us-1' });

      const result = await service.saveAssessment('user-1', {
        skills: [
          { skillId: 'skill-a', status: UserSkillStatus.HAVE, rating: 4 },
        ],
      });

      expect(mockPrisma.userSkill.upsert).toHaveBeenCalledTimes(1);
      expect(mockPrisma.userSkillProgress.createMany).not.toHaveBeenCalled();
      expect(result.updated).toBe(1);
    });

    it('stamps every touched row with one assessment date and leaves onProfile alone', async () => {
      mockPrisma.userPathway.findFirst.mockResolvedValue(buildSaveRow(null));
      mockPrisma.pathwayStep.findMany.mockResolvedValue([
        buildStep('step-1', 1, ['skill-a', 'skill-b']),
      ]);
      mockPrisma.userSkill.findMany.mockResolvedValue([]);
      mockPrisma.userSkill.upsert.mockResolvedValue({ id: 'us-1' });

      const before = new Date();
      await service.saveAssessment('user-1', {
        skills: [
          { skillId: 'skill-a', status: UserSkillStatus.HAVE, rating: 4 },
          { skillId: 'skill-b', status: UserSkillStatus.DONT_HAVE },
        ],
      });
      const after = new Date();

      const writes = mockPrisma.userSkill.upsert.mock.calls.flatMap(
        ([args]) => {
          const { create, update } = args as {
            create: Record<string, unknown>;
            update: Record<string, unknown>;
          };
          return [create, update];
        },
      );
      const stamps = writes.map((write) => write.assessedAt as Date);

      expect(writes).toHaveLength(4);
      expect(new Set(stamps).size).toBe(1);
      expect(stamps[0].getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(stamps[0].getTime()).toBeLessThanOrEqual(after.getTime());
      for (const write of writes) {
        expect(write).not.toHaveProperty('onProfile');
      }
    });

    it('counts an answered Not sure in the stats and leaves out an unanswered skill', async () => {
      const assessedAt = new Date('2026-11-20T10:00:00.000Z');
      mockPrisma.userPathway.findFirst.mockResolvedValue(buildSaveRow(null));
      mockPrisma.pathwayStep.findMany.mockResolvedValue([
        buildStep('step-1', 1, ['skill-a', 'skill-b']),
      ]);
      mockPrisma.userSkill.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          { skillId: 'skill-a', status: UserSkillStatus.NOT_SURE, assessedAt },
          {
            skillId: 'skill-b',
            status: UserSkillStatus.NOT_SURE,
            assessedAt: null,
          },
        ]);
      mockPrisma.userSkill.upsert.mockResolvedValue({ id: 'us-1' });

      const result = await service.saveAssessment('user-1', {
        skills: [{ skillId: 'skill-a', status: UserSkillStatus.NOT_SURE }],
      });

      expect(result.stats).toEqual({ have: 0, dontHave: 0, notSure: 1 });
    });

    it('writes a progress row and clears rating on HAVE → DONT_HAVE', async () => {
      mockPrisma.userPathway.findFirst.mockResolvedValue(buildSaveRow(null));
      mockPrisma.pathwayStep.findMany.mockResolvedValue([
        buildStep('step-1', 1, ['skill-a']),
      ]);
      mockPrisma.userSkill.findMany
        .mockResolvedValueOnce([
          {
            id: 'us-1',
            skillId: 'skill-a',
            status: UserSkillStatus.HAVE,
            rating: 4,
          },
        ])
        .mockResolvedValueOnce([
          { skillId: 'skill-a', status: UserSkillStatus.DONT_HAVE },
        ]);
      mockPrisma.userSkill.upsert.mockResolvedValue({ id: 'us-1' });

      await service.saveAssessment('user-1', {
        skills: [{ skillId: 'skill-a', status: UserSkillStatus.DONT_HAVE }],
      });

      expect(mockPrisma.userSkillProgress.createMany).toHaveBeenCalledWith({
        data: [
          {
            userSkillId: 'us-1',
            rating: null,
            source: 'INITIAL_ASSESSMENT',
          },
        ],
      });
    });

    it('does not update UserPathway when startStepId is unchanged', async () => {
      mockPrisma.userPathway.findFirst.mockResolvedValue(
        buildSaveRow('step-1'),
      );
      mockPrisma.pathwayStep.findMany.mockResolvedValue([
        buildStep('step-1', 1, ['skill-a']),
      ]);
      mockPrisma.userSkill.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          { skillId: 'skill-a', status: UserSkillStatus.DONT_HAVE },
        ]);
      mockPrisma.userSkill.upsert.mockResolvedValue({ id: 'us-1' });

      await service.saveAssessment('user-1', {
        skills: [{ skillId: 'skill-a', status: UserSkillStatus.DONT_HAVE }],
      });

      expect(mockPrisma.userPathway.update).not.toHaveBeenCalled();
    });

    it('updates UserPathway when the headstart step changes', async () => {
      mockPrisma.userPathway.findFirst.mockResolvedValue(buildSaveRow(null));
      mockPrisma.pathwayStep.findMany.mockResolvedValue([
        buildStep('step-1', 1, ['skill-a']),
      ]);
      mockPrisma.userSkill.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          { skillId: 'skill-a', status: UserSkillStatus.DONT_HAVE },
        ]);
      mockPrisma.userSkill.upsert.mockResolvedValue({ id: 'us-1' });
      mockPrisma.userPathway.update.mockResolvedValue({});

      const result = await service.saveAssessment('user-1', {
        skills: [{ skillId: 'skill-a', status: UserSkillStatus.DONT_HAVE }],
      });

      expect(mockPrisma.userPathway.update).toHaveBeenCalledWith({
        where: { userId_careerId: { userId: 'user-1', careerId: 'career-1' } },
        data: { startStepId: 'step-1' },
      });
      expect(result.startStepId).toBe('step-1');
      expect(result.allGapsClosed).toBe(false);
    });

    it('never writes UserPathwayStep', async () => {
      mockPrisma.userPathway.findFirst.mockResolvedValue(buildSaveRow(null));
      mockPrisma.pathwayStep.findMany.mockResolvedValue([
        buildStep('step-1', 1, ['skill-a']),
      ]);
      mockPrisma.userSkill.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          { skillId: 'skill-a', status: UserSkillStatus.DONT_HAVE },
        ]);
      mockPrisma.userSkill.upsert.mockResolvedValue({ id: 'us-1' });
      mockPrisma.userPathway.update.mockResolvedValue({});

      await service.saveAssessment('user-1', {
        skills: [{ skillId: 'skill-a', status: UserSkillStatus.DONT_HAVE }],
      });

      expect(mockPrisma.userPathwayStep.create).not.toHaveBeenCalled();
      expect(mockPrisma.userPathwayStep.createMany).not.toHaveBeenCalled();
      expect(mockPrisma.userPathwayStep.upsert).not.toHaveBeenCalled();
      expect(mockPrisma.userPathwayStep.update).not.toHaveBeenCalled();
      expect(mockPrisma.userPathwayStep.updateMany).not.toHaveBeenCalled();
    });

    it('returns stats and gaps in the response', async () => {
      mockPrisma.userPathway.findFirst.mockResolvedValue(buildSaveRow(null));
      mockPrisma.pathwayStep.findMany.mockResolvedValue([
        {
          id: 'step-1',
          title: 'Step 1',
          description: 'Step 1 description',
          order: 1,
          skills: [
            { skillId: 'skill-a', skill: { name: 'Skill A' } },
            { skillId: 'skill-b', skill: { name: 'Skill B' } },
          ],
        },
      ]);
      mockPrisma.userSkill.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          { skillId: 'skill-a', status: UserSkillStatus.HAVE },
          { skillId: 'skill-b', status: UserSkillStatus.DONT_HAVE },
        ]);
      mockPrisma.userSkill.upsert
        .mockResolvedValueOnce({ id: 'us-1' })
        .mockResolvedValueOnce({ id: 'us-2' });
      mockPrisma.userPathway.update.mockResolvedValue({});

      const result = await service.saveAssessment('user-1', {
        skills: [
          { skillId: 'skill-a', status: UserSkillStatus.HAVE, rating: 3 },
          { skillId: 'skill-b', status: UserSkillStatus.DONT_HAVE },
        ],
      });

      expect(result.stats).toEqual({ have: 1, dontHave: 1, notSure: 0 });
      expect(result.gaps).toHaveLength(1);
      expect(result.gaps[0]).toMatchObject({
        skillId: 'skill-b',
        skillName: 'Skill B',
        stepId: 'step-1',
        stepTitle: 'Step 1',
        stepOrder: 1,
      });
      expect(result.startStepTitle).toBe('Step 1');
      expect(result.startStepDescription).toBe('Step 1 description');
    });
  });

  describe('resetAssessment', () => {
    const where = { userId: 'user-1', skillId: { in: ['skill-a', 'skill-b'] } };

    beforeEach(() => {
      mockPrisma.userPathway.findFirst.mockResolvedValue({
        careerId: 'career-1',
        career: { pathway: { id: 'pathway-1' } },
      });
      mockPrisma.pathwayStepSkill.findMany.mockResolvedValue([
        { skillId: 'skill-a' },
        { skillId: 'skill-b' },
      ]);
      mockPrisma.userSkill.updateMany.mockResolvedValue({ count: 2 });
      mockPrisma.userSkillProgress.deleteMany.mockResolvedValue({ count: 0 });
      mockPrisma.userSkill.deleteMany.mockResolvedValue({ count: 1 });
      mockPrisma.userPathway.update.mockResolvedValue({});
    });

    it('clears the answers, then the progress, then the rows left empty', async () => {
      await service.resetAssessment('user-1');

      expect(mockPrisma.userSkill.updateMany).toHaveBeenCalledWith({
        where,
        data: {
          status: UserSkillStatus.NOT_SURE,
          rating: null,
          assessedAt: null,
        },
      });
      expect(mockPrisma.userSkillProgress.deleteMany).toHaveBeenCalledWith({
        where: { userSkill: where },
      });
      expect(mockPrisma.userSkill.deleteMany).toHaveBeenCalledWith({
        where: { ...where, onProfile: false, assessedAt: null },
      });

      const [cleared] =
        mockPrisma.userSkill.updateMany.mock.invocationCallOrder;
      const [progress] =
        mockPrisma.userSkillProgress.deleteMany.mock.invocationCallOrder;
      const [deleted] =
        mockPrisma.userSkill.deleteMany.mock.invocationCallOrder;
      expect(cleared).toBeLessThan(progress);
      expect(progress).toBeLessThan(deleted);
    });

    it('keeps a profile skill with cleared fields and deletes the rest', async () => {
      const answered = {
        status: UserSkillStatus.HAVE,
        rating: 4,
        assessedAt: new Date('2026-11-20T10:00:00.000Z') as Date | null,
      };
      let rows = [
        { skillId: 'skill-a', onProfile: true, ...answered },
        { skillId: 'skill-b', onProfile: false, ...answered },
      ];
      mockPrisma.userSkill.updateMany.mockImplementation((args) => {
        const { data } = args as { data: object };
        rows = rows.map((row) => ({ ...row, ...data }));
        return Promise.resolve({ count: rows.length });
      });
      mockPrisma.userSkill.deleteMany.mockImplementation((args) => {
        const { where: match } = args as {
          where: { onProfile: boolean; assessedAt: null };
        };
        rows = rows.filter(
          (row) =>
            row.onProfile !== match.onProfile ||
            row.assessedAt !== match.assessedAt,
        );
        return Promise.resolve({ count: 1 });
      });

      await service.resetAssessment('user-1');

      expect(rows).toEqual([
        {
          skillId: 'skill-a',
          onProfile: true,
          status: UserSkillStatus.NOT_SURE,
          rating: null,
          assessedAt: null,
        },
      ]);
    });

    it('clears startStepId and leaves step completions alone', async () => {
      await service.resetAssessment('user-1');

      expect(mockPrisma.userPathway.update).toHaveBeenCalledWith({
        where: { userId_careerId: { userId: 'user-1', careerId: 'career-1' } },
        data: { startStepId: null },
      });
      expect(mockPrisma.userPathwayStep.create).not.toHaveBeenCalled();
      expect(mockPrisma.userPathwayStep.updateMany).not.toHaveBeenCalled();
    });
  });
});
