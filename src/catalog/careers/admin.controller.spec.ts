import { jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import type { AuthenticatedUser } from '../../common';
import { CareerStatus } from '../../generated/prisma/client';
import { AdminCareersController } from './admin.controller';
import { CareersService } from './careers.service';
import type { DeleteCareerResponseDto } from './dto/delete-career-response.dto';
import type { CreateCareerDto } from './dto/create-career.dto';
import type { CreateCareerResponseDto } from './dto/create-career-response.dto';
import type { GetAdminCareersQueryDto } from './dto/get-admin-careers-query.dto';
import type {
  AdminCareerDetailDto,
  AdminCareerListResponseDto,
} from './dto/admin-career.dto';
import { RetireCareerResponseDto } from './dto/retire-career-response.dto';

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
    listCareersForStaff:
      jest.fn<
        (query: GetAdminCareersQueryDto) => Promise<AdminCareerListResponseDto>
      >(),
    getCareerForStaff: jest.fn<(id: string) => Promise<AdminCareerDetailDto>>(),
    retireCareer:
      jest.fn<
        (id: string, actorUserId: string) => Promise<RetireCareerResponseDto>
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

  describe('listCareers', () => {
    it('should pass the query to careersService.listCareersForStaff and return its result', async () => {
      const query: GetAdminCareersQueryDto = {
        status: CareerStatus.DRAFT,
        search: 'data',
        page: 2,
        limit: 10,
      };
      const response: AdminCareerListResponseDto = {
        items: [],
        total: 0,
        page: 2,
        limit: 10,
      };
      mockCareersService.listCareersForStaff.mockResolvedValue(response);

      const result = await controller.listCareers(query);

      expect(mockCareersService.listCareersForStaff).toHaveBeenCalledWith(
        query,
      );
      expect(result).toBe(response);
    });
  });

  describe('getCareer', () => {
    it('should pass the id to careersService.getCareerForStaff and return its result', async () => {
      const career = { id: 'career-1' } as AdminCareerDetailDto;
      mockCareersService.getCareerForStaff.mockResolvedValue(career);

      const result = await controller.getCareer('career-1');

      expect(mockCareersService.getCareerForStaff).toHaveBeenCalledWith(
        'career-1',
      );
      expect(result).toBe(career);
    });
  });

  describe('retireCareer', () => {
    it("should pass the id and the actor's id to careersService.retireCareer and return its result", async () => {
      const retired = {
        id: 'career-1',
        status: 'RETIRED',
      } as RetireCareerResponseDto;
      mockCareersService.retireCareer.mockResolvedValue(retired);

      const result = await controller.retireCareer('career-1', admin);

      expect(mockCareersService.retireCareer).toHaveBeenCalledWith(
        'career-1',
        'admin-1',
      );
      expect(result).toBe(retired);
    });
  });
});
