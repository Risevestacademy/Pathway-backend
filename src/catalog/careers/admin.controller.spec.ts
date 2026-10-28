import { jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import type { AuthenticatedUser } from '../../common';
import { AdminCareersController } from './admin.controller';
import { CareersService } from './careers.service';
import type { DeleteCareerResponseDto } from './dto/delete-career-response.dto';
import type { CreateCareerDto } from './dto/create-career.dto';
import type { CreateCareerResponseDto } from './dto/create-career-response.dto';

describe('AdminCareersController', () => {
  let controller: AdminCareersController;

  const mockCareersService = {
    deleteCareer:
      jest.fn<
        (id: string, actorUserId: string) => Promise<DeleteCareerResponseDto>
      >(),
    createCareer:
      jest.fn<
        (
          dto: CreateCareerDto,
          actorUserId: string,
        ) => Promise<CreateCareerResponseDto>
      >(),
  };

  const admin: AuthenticatedUser = {
    id: 'admin-1',
    email: 'admin@example.com',
    role: 'ADMIN',
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminCareersController],
      providers: [{ provide: CareersService, useValue: mockCareersService }],
    }).compile();

    controller = module.get<AdminCareersController>(AdminCareersController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('createCareer', () => {
    it("should pass the body and the actor's id to careersService.createCareer and return its result", async () => {
      const dto: CreateCareerDto = {
        title: 'DevOps Engineer',
        slug: 'devops-engineer',
        fieldId: 'field-1',
        description: 'Automates delivery.',
      };
      const created = {
        id: 'career-1',
        revision: { id: 'revision-1' },
      } as CreateCareerResponseDto;
      mockCareersService.createCareer.mockResolvedValue(created);

      const result = await controller.createCareer(dto, admin);

      expect(mockCareersService.createCareer).toHaveBeenCalledWith(
        dto,
        'admin-1',
      );
      expect(result).toBe(created);
    });
  });

  describe('deleteCareer', () => {
    it("should pass the id and the admin's id to careersService.deleteCareer and return its result", async () => {
      mockCareersService.deleteCareer.mockResolvedValue({
        message: 'Career deleted',
      });

      const result = await controller.deleteCareer('career-1', admin);

      expect(mockCareersService.deleteCareer).toHaveBeenCalledWith(
        'career-1',
        'admin-1',
      );
      expect(result).toEqual({ message: 'Career deleted' });
    });
  });
});
