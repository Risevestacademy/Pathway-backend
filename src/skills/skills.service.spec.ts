import { jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { SkillsService } from './skills.service';
import { PrismaService } from '../prisma';
import { SkillListItemDto } from './dto/list-skills.dto';
import { DomainException } from '../common';
import { UserSkillStatus } from '../generated/prisma/browser';

describe('SkillsService', () => {
  let service: SkillsService;

  const mockPrismaService = {
    skill: {
      findMany:
        jest.fn<
          (args: unknown) => Promise<SkillListItemDto[] | { id: string }[]>
        >(),
    },
    userSkill: {
      updateMany: jest.fn<(args: unknown) => Promise<{ count: number }>>(),
      upsert: jest.fn<(args: unknown) => Promise<unknown>>(),
    },
    $transaction: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    mockPrismaService.$transaction.mockImplementation(
      async (cb: (tx: typeof mockPrismaService) => Promise<unknown>) =>
        cb(mockPrismaService),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SkillsService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<SkillsService>(SkillsService);
  });
  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getSkills', () => {
    const mockDbSkills: SkillListItemDto[] = [
      {
        id: 'skill-docker',
        name: 'Docker',
        description: 'Packaging applications into portable containers.',
      },
      {
        id: 'skill-git',
        name: 'Git',
        description: null,
      },
    ];

    it('should return every skill with its id, name and description', async () => {
      mockPrismaService.skill.findMany.mockResolvedValue(mockDbSkills);

      const result = await service.getSkills();

      expect(result).toEqual(mockDbSkills);
    });

    it('should query all skills sorted by name without filtering', async () => {
      mockPrismaService.skill.findMany.mockResolvedValue(mockDbSkills);

      await service.getSkills();

      expect(mockPrismaService.skill.findMany).toHaveBeenCalledTimes(1);
      expect(mockPrismaService.skill.findMany).toHaveBeenCalledWith({
        select: {
          id: true,
          name: true,
          description: true,
        },
        orderBy: {
          name: 'asc',
        },
      });
    });

    it('should return an empty array when there are no skills', async () => {
      mockPrismaService.skill.findMany.mockResolvedValue([]);

      const result = await service.getSkills();

      expect(result).toEqual([]);
    });
  });

  describe('updateMySkills', () => {
    it('throws UNKNOWN_SKILL when a skillId does not exist', async () => {
      mockPrismaService.skill.findMany.mockResolvedValue([{ id: 'known' }]);

      await expect(
        service.updateMySkills('user-1', ['known', 'unknown']),
      ).rejects.toThrow(DomainException);

      expect(mockPrismaService.userSkill.updateMany).not.toHaveBeenCalled();
      expect(mockPrismaService.userSkill.upsert).not.toHaveBeenCalled();
    });

    it('takes unlisted skills off the profile and puts listed ones on it', async () => {
      mockPrismaService.skill.findMany.mockResolvedValue([
        { id: 'a' },
        { id: 'b' },
      ]);
      mockPrismaService.userSkill.updateMany.mockResolvedValue({ count: 0 });
      mockPrismaService.userSkill.upsert.mockResolvedValue({});

      await service.updateMySkills('user-1', ['a', 'b', 'a']);

      expect(mockPrismaService.userSkill.updateMany).toHaveBeenCalledTimes(1);
      expect(mockPrismaService.userSkill.updateMany).toHaveBeenCalledWith({
        where: {
          userId: 'user-1',
          onProfile: true,
          skillId: { notIn: ['a', 'b'] },
        },
        data: { onProfile: false },
      });
      expect(mockPrismaService.userSkill.upsert).toHaveBeenCalledTimes(2);
      expect(mockPrismaService.userSkill.upsert).toHaveBeenCalledWith({
        where: { userId_skillId: { userId: 'user-1', skillId: 'a' } },
        create: { userId: 'user-1', skillId: 'a', onProfile: true },
        update: { onProfile: true },
      });
    });

    describe('with an assessed skill', () => {
      const assessedAt = new Date('2026-11-20T10:00:00.000Z');
      let row: Record<string, unknown>;

      beforeEach(() => {
        row = {
          userId: 'user-1',
          skillId: 'a',
          status: UserSkillStatus.HAVE,
          rating: 4,
          onProfile: false,
          assessedAt,
        };
        mockPrismaService.skill.findMany.mockImplementation((args) =>
          Promise.resolve(
            (args as { where: { id: { in: string[] } } }).where.id.in.map(
              (id) => ({ id }),
            ),
          ),
        );
        mockPrismaService.userSkill.updateMany.mockImplementation((args) => {
          const { where, data } = args as {
            where: { skillId: { notIn: string[] } };
            data: Record<string, unknown>;
          };
          const matches =
            row.onProfile === true &&
            !where.skillId.notIn.includes(row.skillId as string);
          if (matches) Object.assign(row, data);
          return Promise.resolve({ count: matches ? 1 : 0 });
        });
        mockPrismaService.userSkill.upsert.mockImplementation((args) => {
          const { where, update } = args as {
            where: { userId_skillId: { skillId: string } };
            update: Record<string, unknown>;
          };
          if (where.userId_skillId.skillId === row.skillId) {
            Object.assign(row, update);
          }
          return Promise.resolve({});
        });
      });

      it('keeps the answer when the skill leaves the profile', async () => {
        row.onProfile = true;

        await service.updateMySkills('user-1', []);

        expect(row).toMatchObject({
          onProfile: false,
          status: UserSkillStatus.HAVE,
          rating: 4,
          assessedAt,
        });
      });

      it('keeps the answer when the skill is added, removed and added again', async () => {
        for (const skillIds of [['a'], ['b'], ['a']]) {
          await service.updateMySkills('user-1', skillIds);

          expect(row).toMatchObject({
            onProfile: skillIds.includes('a'),
            status: UserSkillStatus.HAVE,
            rating: 4,
            assessedAt,
          });
        }
      });
    });
  });
});
