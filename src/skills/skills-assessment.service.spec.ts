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
    userSkill: {
      findMany: jest.fn<() => Promise<unknown>>(),
      upsert: jest.fn<() => Promise<unknown>>(),
    },
    userSkillProgress: {
      createMany: jest.fn<() => Promise<unknown>>(),
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
        },
      ]);
    });

    it('returns saved status and rating for pre-fill', async () => {
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
        { skillId: 'skill-a', status: UserSkillStatus.HAVE, rating: 4 },
      ]);

      const result = await service.getAssessment('user-1');

      expect(result.stages[0].skills[0]).toEqual({
        skillId: 'skill-a',
        skillName: 'A',
        status: UserSkillStatus.HAVE,
        rating: 4,
      });
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

    const buildStep = (
      id: string,
      order: number,
      skillIds: string[],
    ): { id: string; order: number; skills: Array<{ skillId: string }> } => ({
      id,
      order,
      skills: skillIds.map((skillId) => ({ skillId })),
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
  });
});
