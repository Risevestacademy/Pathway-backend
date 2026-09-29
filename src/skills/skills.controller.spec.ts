import { jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { SkillsController } from './skills.controller';
import { SkillsService } from './skills.service';
import { SkillListItemDto } from './dto/list-skills.dto';

describe('SkillsController', () => {
  let controller: SkillsController;

  const mockSkillsService = {
    getSkills: jest.fn<() => Promise<SkillListItemDto[]>>(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SkillsController],
      providers: [
        {
          provide: SkillsService,
          useValue: mockSkillsService,
        },
      ],
    }).compile();

    controller = module.get<SkillsController>(SkillsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getSkills', () => {
    it('should return the skills from skillsService.getSkills', async () => {
      const mockResult: SkillListItemDto[] = [
        {
          id: 'skill-git',
          name: 'Git',
          description: 'Version control for tracking and sharing code changes.',
        },
      ];

      mockSkillsService.getSkills.mockResolvedValue(mockResult);

      const result = await controller.getSkills();

      expect(mockSkillsService.getSkills).toHaveBeenCalledTimes(1);
      expect(result).toEqual(mockResult);
    });
  });
});
