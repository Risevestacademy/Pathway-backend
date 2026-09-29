import { jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { SkillsService } from './skills.service';
import { PrismaService } from '../prisma';
import { SkillListItemDto } from './dto/list-skills.dto';

describe('SkillsService', () => {
  let service: SkillsService;

  const mockPrismaService = {
    skill: {
      findMany: jest.fn<(args: unknown) => Promise<SkillListItemDto[]>>(),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SkillsService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
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
});
