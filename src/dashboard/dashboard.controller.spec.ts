import { jest } from '@jest/globals';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Test, TestingModule } from '@nestjs/testing';
import { JwtAuthGuard, type AuthenticatedUser } from '../common';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import type { DashboardDto } from './dto/dashboard-response.dto';

describe('DashboardController', () => {
  let controller: DashboardController;

  const mockDashboardService = {
    getDashboard: jest.fn<(userId: string) => Promise<DashboardDto>>(),
  };

  const user: AuthenticatedUser = {
    id: 'user-1',
    email: 'user@example.com',
    role: 'USER',
  };

  const dashboard = {
    totals: {
      savedPathways: 1,
      completedSteps: 16,
      xp: 800,
      badgesEarned: 4,
      badgesTotal: 4,
    },
    streak: { current: 3, longest: 9 },
    heatmap: { from: '2025-11-15', to: '2026-11-14', days: [] },
    badges: [],
    activePathway: {
      career: null,
      pathway: null,
      progress: null,
      steps: [],
    },
    todaysGoals: { step: null, tasks: [], resources: [] },
  } as unknown as DashboardDto;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [DashboardController],
      providers: [
        { provide: DashboardService, useValue: mockDashboardService },
      ],
    }).compile();

    controller = module.get<DashboardController>(DashboardController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getDashboard', () => {
    it("delegates the caller's id to dashboardService.getDashboard", async () => {
      mockDashboardService.getDashboard.mockResolvedValue(dashboard);

      const result = await controller.getDashboard(user);

      expect(mockDashboardService.getDashboard).toHaveBeenCalledWith('user-1');
      expect(result).toEqual(dashboard);
    });

    it('requires an authenticated user', () => {
      const guards = Reflect.getMetadata(
        GUARDS_METADATA,
        DashboardController,
      ) as unknown[];

      expect(guards).toContain(JwtAuthGuard);
    });
  });
});
