import { jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import type { AuthenticatedUser } from '../../common';
import { AdminCareersController } from './admin.controller';
import { CareersService } from './careers.service';
import type { DeleteCareerResponseDto } from './dto/delete-career-response.dto';

describe('AdminCareersController', () => {
  let controller: AdminCareersController;

  const mockCareersService = {
    deleteCareer:
      jest.fn<
        (id: string, actorUserId: string) => Promise<DeleteCareerResponseDto>
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
