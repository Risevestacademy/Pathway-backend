import { jest } from '@jest/globals';
import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { PathwayStepsService } from './pathway-steps.service';
import { PrismaService } from '../../prisma';
import {
  CareerStatus,
  ResourceCostStatus,
  ResourceStatus,
  ResourceType,
} from '../../generated/prisma/client';

describe('PathwayStepsService', () => {
  let service: PathwayStepsService;

  const mockPrismaService = {
    pathwayStep: {
      findFirst: jest.fn<(args: unknown) => Promise<unknown>>(),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PathwayStepsService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<PathwayStepsService>(PathwayStepsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

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
        {
          skill: {
            id: 'skill-nest',
            name: 'NestJS',
          },
        },
        {
          skill: {
            id: 'skill-sql',
            name: 'SQL',
          },
        },
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
            skills: [
              {
                skill: {
                  id: 'skill-nest',
                  name: 'NestJS',
                },
              },
            ],
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
            certificationCost: {
              toString: () => '150.00',
            },
            curationRationale: 'Recognised credential.',
            lastCheckedDate: new Date('2026-02-01'),
            skills: [
              {
                skill: {
                  id: 'skill-sql',
                  name: 'SQL',
                },
              },
            ],
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
          {
            id: 'skill-nest',
            name: 'NestJS',
          },
          {
            id: 'skill-sql',
            name: 'SQL',
          },
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
            skills: [
              {
                id: 'skill-nest',
                name: 'NestJS',
              },
            ],
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
            skills: [
              {
                id: 'skill-sql',
                name: 'SQL',
              },
            ],
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
            pathway: {
              career: {
                status: CareerStatus.PUBLISHED,
              },
            },
          },
        }),
      );
    });

    it('should only include ACTIVE resources', async () => {
      await service.getPathwayStepById('step-1');

      const call = mockPrismaService.pathwayStep.findFirst.mock.calls[0][0] as {
        select: {
          resources: {
            where: unknown;
          };
        };
      };

      expect(call.select.resources.where).toEqual({
        resource: {
          status: ResourceStatus.ACTIVE,
        },
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
  });
});
