import { jest } from '@jest/globals';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { PathwayStepsService } from './pathway-steps.service';
import { PrismaService } from '../../prisma';
import { AnalyticsService } from '../../analytics';
import {
  CareerStatus,
  ResourceCostStatus,
  ResourceStatus,
  ResourceType,
} from '../../generated/prisma/client';

describe('PathwayStepsService', () => {
  let service: PathwayStepsService;

  const mockAnalyticsService = {
    capture:
      jest.fn<
        (event: string, distinctId: string, properties?: unknown) => void
      >(),
  };

  const mockPrismaService = {
    pathwayStep: {
      findFirst: jest.fn<(args: unknown) => Promise<unknown>>(),
      findMany: jest.fn<(args: unknown) => Promise<unknown>>(),
    },
    userPathway: {
      findUnique: jest.fn<(args: unknown) => Promise<unknown>>(),
    },
    userPathwayStep: {
      findMany: jest.fn<(args: unknown) => Promise<unknown>>(),
      updateMany: jest.fn<(args: unknown) => Promise<unknown>>(),
      createMany: jest.fn<(args: unknown) => Promise<unknown>>(),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PathwayStepsService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: AnalyticsService, useValue: mockAnalyticsService },
      ],
    }).compile();

    service = module.get<PathwayStepsService>(PathwayStepsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ──────────────────────────────────────────────────────────────
  // getPathwayStepById
  // ──────────────────────────────────────────────────────────────
  describe('getPathwayStepById', () => {
    const mockDbStep = {
      id: 'step-1',
      pathwayId: 'pathway-1',
      title: 'Build an API',
      description: 'Design and build REST endpoints.',
      learningObjective: 'Build a REST API.',
      prerequisites: 'TypeScript basics.',
      expectedActivity: 'Build a CRUD API.',
      order: 2,
      pathway: {
        careerId: 'career-1',
      },
      skills: [
        { skill: { id: 'skill-nest', name: 'NestJS' } },
        { skill: { id: 'skill-sql', name: 'SQL' } },
      ],
      resources: [
        {
          resource: {
            id: 'resource-1',
            title: 'NestJS Docs',
            description: null,
            url: 'https://nestjs.com',
            type: ResourceType.ARTICLE,
            provider: 'NestJS',
            costStatus: ResourceCostStatus.FREE,
            certificationCost: null,
            curationRationale: 'Official documentation.',
            lastCheckedDate: new Date('2026-01-01'),
            skills: [{ skill: { id: 'skill-nest', name: 'NestJS' } }],
          },
        },
        {
          resource: {
            id: 'resource-2',
            title: 'SQL Certification',
            description: 'Proctored SQL exam.',
            url: 'https://example.com/sql',
            type: ResourceType.CERTIFICATION,
            provider: 'Example Academy',
            costStatus: ResourceCostStatus.PAID,
            certificationCost: { toString: () => '150.00' },
            curationRationale: 'Recognised credential.',
            lastCheckedDate: new Date('2026-02-01'),
            skills: [{ skill: { id: 'skill-sql', name: 'SQL' } }],
          },
        },
      ],
    };

    beforeEach(() => {
      mockPrismaService.pathwayStep.findFirst.mockResolvedValue(mockDbStep);
    });

    it('should map step, skill and nested resource data correctly', async () => {
      const result = await service.getPathwayStepById('step-1');

      expect(result).toEqual({
        id: 'step-1',
        pathwayId: 'pathway-1',
        careerId: 'career-1',
        title: 'Build an API',
        description: 'Design and build REST endpoints.',
        learningObjective: 'Build a REST API.',
        prerequisites: 'TypeScript basics.',
        expectedActivity: 'Build a CRUD API.',
        order: 2,
        skills: [
          { id: 'skill-nest', name: 'NestJS' },
          { id: 'skill-sql', name: 'SQL' },
        ],
        resources: [
          {
            id: 'resource-1',
            title: 'NestJS Docs',
            description: null,
            url: 'https://nestjs.com',
            type: ResourceType.ARTICLE,
            provider: 'NestJS',
            costStatus: ResourceCostStatus.FREE,
            certificationCost: null,
            curationRationale: 'Official documentation.',
            lastCheckedDate: new Date('2026-01-01'),
            skills: [{ id: 'skill-nest', name: 'NestJS' }],
          },
          {
            id: 'resource-2',
            title: 'SQL Certification',
            description: 'Proctored SQL exam.',
            url: 'https://example.com/sql',
            type: ResourceType.CERTIFICATION,
            provider: 'Example Academy',
            costStatus: ResourceCostStatus.PAID,
            certificationCost: '150.00',
            curationRationale: 'Recognised credential.',
            lastCheckedDate: new Date('2026-02-01'),
            skills: [{ id: 'skill-sql', name: 'SQL' }],
          },
        ],
      });
    });

    it('should return empty skills and resources arrays when the step has none', async () => {
      mockPrismaService.pathwayStep.findFirst.mockResolvedValue({
        ...mockDbStep,
        skills: [],
        resources: [],
      });

      const result = await service.getPathwayStepById('step-1');

      expect(result.skills).toEqual([]);
      expect(result.resources).toEqual([]);
    });

    it('should only load steps whose career is published', async () => {
      await service.getPathwayStepById('step-1');

      expect(mockPrismaService.pathwayStep.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            id: 'step-1',
            pathway: { career: { status: CareerStatus.PUBLISHED } },
          },
        }),
      );
    });

    it('should only include ACTIVE resources', async () => {
      await service.getPathwayStepById('step-1');

      const call = mockPrismaService.pathwayStep.findFirst.mock.calls[0][0] as {
        select: { resources: { where: unknown } };
      };

      expect(call.select.resources.where).toEqual({
        resource: { status: ResourceStatus.ACTIVE },
      });
    });

    it('should throw NotFoundException when the step does not exist', async () => {
      mockPrismaService.pathwayStep.findFirst.mockResolvedValue(null);

      await expect(service.getPathwayStepById('missing-step')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw NotFoundException when the step belongs to an unpublished career', async () => {
      mockPrismaService.pathwayStep.findFirst.mockResolvedValue(null);

      await expect(service.getPathwayStepById('draft-step')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should not touch analytics when reading a step', async () => {
      await service.getPathwayStepById('step-1');
      expect(mockAnalyticsService.capture).not.toHaveBeenCalled();
    });
  });

  // ──────────────────────────────────────────────────────────────
  // setStepStatus
  // ──────────────────────────────────────────────────────────────
  describe('setStepStatus', () => {
    const steps = [
      { id: 'step-1', order: 1 },
      { id: 'step-2', order: 2 },
    ];

    beforeEach(() => {
      mockPrismaService.pathwayStep.findFirst.mockResolvedValue({
        pathwayId: 'pathway-1',
        pathway: { careerId: 'career-1' },
      });
      mockPrismaService.userPathway.findUnique.mockResolvedValue({
        startStepId: null,
      });
      mockPrismaService.userPathwayStep.updateMany.mockResolvedValue({
        count: 0,
      });
      mockPrismaService.userPathwayStep.createMany.mockResolvedValue({
        count: 1,
      });
      mockPrismaService.pathwayStep.findMany.mockResolvedValue(steps);
      mockPrismaService.userPathwayStep.findMany.mockResolvedValue([
        { pathwayStepId: 'step-1', status: 'COMPLETED' },
      ]);
    });

    it('looks up the step under a PUBLISHED career or a RETIRED career the user saved', async () => {
      await service.setStepStatus('user-1', 'step-1', 'COMPLETED');

      expect(mockPrismaService.pathwayStep.findFirst).toHaveBeenCalledWith({
        where: {
          id: 'step-1',
          pathway: {
            career: {
              OR: [
                { status: CareerStatus.PUBLISHED },
                {
                  status: CareerStatus.RETIRED,
                  userPathways: { some: { userId: 'user-1' } },
                },
              ],
            },
          },
        },
        select: { pathwayId: true, pathway: { select: { careerId: true } } },
      });
    });

    it('throws NotFoundException and writes nothing for an unknown or hidden step', async () => {
      mockPrismaService.pathwayStep.findFirst.mockResolvedValue(null);

      await expect(
        service.setStepStatus('user-1', 'step-1', 'COMPLETED'),
      ).rejects.toThrow(NotFoundException);

      expect(
        mockPrismaService.userPathwayStep.updateMany,
      ).not.toHaveBeenCalled();
      expect(mockAnalyticsService.capture).not.toHaveBeenCalled();
    });

    it('throws ConflictException and writes nothing when the career is not saved', async () => {
      mockPrismaService.userPathway.findUnique.mockResolvedValue(null);

      await expect(
        service.setStepStatus('user-1', 'step-1', 'COMPLETED'),
      ).rejects.toThrow(ConflictException);

      expect(mockPrismaService.userPathway.findUnique).toHaveBeenCalledWith({
        where: { userId_careerId: { userId: 'user-1', careerId: 'career-1' } },
        select: { startStepId: true },
      });
      expect(
        mockPrismaService.userPathwayStep.updateMany,
      ).not.toHaveBeenCalled();
      expect(mockAnalyticsService.capture).not.toHaveBeenCalled();
    });

    it('creates a COMPLETED row with completedAt when none exists, and emits once', async () => {
      await service.setStepStatus('user-1', 'step-1', 'COMPLETED');

      expect(mockPrismaService.userPathwayStep.updateMany).toHaveBeenCalledWith(
        {
          where: {
            userId: 'user-1',
            pathwayStepId: 'step-1',
            status: { not: 'COMPLETED' },
          },
          data: { status: 'COMPLETED', completedAt: expect.any(Date) },
        },
      );
      expect(mockPrismaService.userPathwayStep.createMany).toHaveBeenCalledWith(
        {
          data: [
            {
              userId: 'user-1',
              pathwayStepId: 'step-1',
              status: 'COMPLETED',
              completedAt: expect.any(Date),
            },
          ],
          skipDuplicates: true,
        },
      );
      expect(mockAnalyticsService.capture.mock.calls).toEqual([
        [
          'step_completion_changed',
          'user-1',
          { careerId: 'career-1', stepId: 'step-1', status: 'COMPLETED' },
        ],
      ]);
    });

    it('emits nothing when the step is already COMPLETED', async () => {
      mockPrismaService.userPathwayStep.createMany.mockResolvedValue({
        count: 0,
      });

      const result = await service.setStepStatus(
        'user-1',
        'step-1',
        'COMPLETED',
      );

      expect(result.status).toBe('COMPLETED');
      expect(mockAnalyticsService.capture).not.toHaveBeenCalled();
    });

    it('clears completedAt when marking a step NOT_STARTED, and emits', async () => {
      mockPrismaService.userPathwayStep.updateMany.mockResolvedValue({
        count: 1,
      });

      await service.setStepStatus('user-1', 'step-1', 'NOT_STARTED');

      expect(mockPrismaService.userPathwayStep.updateMany).toHaveBeenCalledWith(
        {
          where: {
            userId: 'user-1',
            pathwayStepId: 'step-1',
            status: { not: 'NOT_STARTED' },
          },
          data: { status: 'NOT_STARTED', completedAt: null },
        },
      );
      expect(
        mockPrismaService.userPathwayStep.createMany,
      ).not.toHaveBeenCalled();
      expect(mockAnalyticsService.capture).toHaveBeenCalledWith(
        'step_completion_changed',
        'user-1',
        { careerId: 'career-1', stepId: 'step-1', status: 'NOT_STARTED' },
      );
    });

    it('creates no row and emits nothing for NOT_STARTED on an untouched step', async () => {
      await service.setStepStatus('user-1', 'step-2', 'NOT_STARTED');

      expect(
        mockPrismaService.userPathwayStep.createMany,
      ).not.toHaveBeenCalled();
      expect(mockAnalyticsService.capture).not.toHaveBeenCalled();
    });

    it('emits only after the write', async () => {
      await service.setStepStatus('user-1', 'step-1', 'COMPLETED');

      expect(
        mockPrismaService.userPathwayStep.createMany.mock
          .invocationCallOrder[0],
      ).toBeLessThan(mockAnalyticsService.capture.mock.invocationCallOrder[0]);
    });

    it('returns the updated progress, using the saved starting point', async () => {
      mockPrismaService.userPathway.findUnique.mockResolvedValue({
        startStepId: 'step-2',
      });

      const result = await service.setStepStatus(
        'user-1',
        'step-1',
        'COMPLETED',
      );

      expect(mockPrismaService.userPathwayStep.findMany).toHaveBeenCalledWith({
        where: {
          userId: 'user-1',
          pathwayStep: { pathwayId: 'pathway-1' },
        },
        select: { pathwayStepId: true, status: true },
      });
      expect(mockPrismaService.pathwayStep.findMany).toHaveBeenCalledWith({
        where: { pathwayId: 'pathway-1' },
        select: { id: true, order: true },
      });
      expect(result).toEqual({
        stepId: 'step-1',
        status: 'COMPLETED',
        progress: {
          completed: 1,
          total: 2,
          percentage: 50,
          nextStepId: 'step-2',
          selfReported: true,
          startStepId: 'step-2',
        },
      });
    });

    it('does not open a transaction around the writes', async () => {
      // The service does three sequential awaits, no $transaction.
      // Guards against someone reintroducing a transaction that would
      // re-open the door to the earlier "analytics inside tx" bug.
      expect(
        (mockPrismaService as { $transaction?: unknown }).$transaction,
      ).toBeUndefined();

      await service.setStepStatus('user-1', 'step-1', 'COMPLETED');
    });
  });
});
