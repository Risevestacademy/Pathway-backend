import { jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { JwtAuthGuard, type AuthenticatedUser } from '../../common';
import { Role } from '../../generated/prisma/enums';
import { MeController } from './me.controller';
import { PathwaysService } from './pathways.service';
import { StartingPointResponseDto } from './dto/starting-point-response.dto';

describe('MeController', () => {
  let controller: MeController;

  const mockPathwaysService = {
    setStartingPoint:
      jest.fn<
        (
          userId: string,
          careerId: string,
          stepId: string | null,
        ) => Promise<StartingPointResponseDto>
      >(),
  };

  const user: AuthenticatedUser = {
    id: 'user-1',
    email: 'dev@example.com',
    role: Role.USER,
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [MeController],
      providers: [{ provide: PathwaysService, useValue: mockPathwaysService }],
    }).compile();

    controller = module.get<MeController>(MeController);
  });

  it('requires an authenticated user on every route', () => {
    const guards = Reflect.getMetadata(
      GUARDS_METADATA,
      MeController,
    ) as unknown[];

    expect(guards).toContain(JwtAuthGuard);
  });

  describe('setStartingPoint', () => {
    it.each([
      ['a step id', 'step-2'],
      ['null', null],
    ])(
      "delegates the caller's id, the career id and %s to pathwaysService.setStartingPoint",
      async (_label, stepId) => {
        const mockResult: StartingPointResponseDto = {
          careerId: 'career-1',
          startStepId: stepId,
          progress: {
            completed: 0,
            total: 2,
            percentage: 0,
            nextStepId: 'step-2',
            selfReported: true,
            startStepId: stepId,
          },
        };

        mockPathwaysService.setStartingPoint.mockResolvedValue(mockResult);

        const result = await controller.setStartingPoint(user, 'career-1', {
          stepId,
        });

        expect(mockPathwaysService.setStartingPoint).toHaveBeenCalledWith(
          'user-1',
          'career-1',
          stepId,
        );
        expect(result).toEqual(mockResult);
      },
    );
  });
});
