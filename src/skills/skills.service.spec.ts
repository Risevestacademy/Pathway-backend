import { jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { SkillsService } from './skills.service';
import { PrismaService } from '../prisma';
import { SkillListItemDto } from './dto/list-skills.dto';
import { DomainException } from '../common';

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
      deleteMany: jest.fn<() => Promise<{ count: number }>>(),
      upsert: jest.fn<() => Promise<unknown>>(),
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

      expect(mockPrismaService.userSkill.deleteMany).not.toHaveBeenCalled();
    });

    it('deletes skills not in the list and upserts the rest', async () => {
      mockPrismaService.skill.findMany.mockResolvedValue([
        { id: 'a' },
        { id: 'b' },
      ]);
      mockPrismaService.userSkill.deleteMany.mockResolvedValue({ count: 0 });
      mockPrismaService.userSkill.upsert.mockResolvedValue({});

      await service.updateMySkills('user-1', ['a', 'b']);

      expect(mockPrismaService.userSkill.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', skillId: { notIn: ['a', 'b'] } },
      });
      expect(mockPrismaService.userSkill.upsert).toHaveBeenCalledTimes(2);
    });
  });
});
