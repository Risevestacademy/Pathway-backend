import { jest } from '@jest/globals';
import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { PathwaysService } from './pathways.service';
import { PrismaService } from '../../../prisma';
import {
  CareerStatus,
  ResourceCostStatus,
  ResourceStatus,
  ResourceType,
} from '../../../generated/prisma/client';

describe('PathwaysService', () => {
  let service: PathwaysService;

  const mockPrismaService = {
    career: {
      findFirst: jest.fn<(args: unknown) => Promise<unknown>>(),
    },
    pathway: {
      findUnique: jest.fn<(args: unknown) => Promise<unknown>>(),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PathwaysService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<PathwaysService>(PathwaysService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getCareerPathway', () => {
    const mockPublishedCareer = {
      id: 'career-1',
    };

    const mockDbPathway = {
      id: 'pathway-1',
      careerId: 'career-1',
      title: 'Backend Roadmap',
      description: 'From fundamentals to production APIs.',
      steps: [
        {
          id: 'step-2',
          title: 'Build an API',
          description: null,
          learningObjective: 'Build a REST API.',
          prerequisites: 'TypeScript basics.',
          expectedActivity: 'Build a CRUD API.',
          order: 2,
          skills: [
            {
              skill: {
                id: 'skill-nest',
                name: 'NestJS',
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
                certificationCost: {
                  toString: () => '0.00',
                },
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
          ],
        },
        {
          id: 'step-1',
          title: 'Learn TypeScript',
          description: null,
          learningObjective: 'Use TypeScript basics.',
          prerequisites: null,
          expectedActivity: 'Complete an exercise.',
          order: 1,
          skills: [
            {
              skill: {
                id: 'skill-ts',
                name: 'TypeScript',
              },
            },
          ],
          resources: [],
        },
      ],
    };

    beforeEach(() => {
      mockPrismaService.career.findFirst.mockResolvedValue(mockPublishedCareer);
      mockPrismaService.pathway.findUnique.mockResolvedValue(mockDbPathway);
    });

    it('should return the pathway with its steps in the order returned by Prisma', async () => {
      const result = await service.getCareerPathway('career-1');

      expect(result.pathway?.steps.map((step) => step.order)).toEqual([2, 1]);
    });

    it('should map pathway, step, skill and resource data correctly', async () => {
      const result = await service.getCareerPathway('career-1');

      expect(result).toEqual({
        pathway: {
          id: 'pathway-1',
          careerId: 'career-1',
          title: 'Backend Roadmap',
          description: 'From fundamentals to production APIs.',
          steps: [
            {
              id: 'step-2',
              title: 'Build an API',
              description: null,
              learningObjective: 'Build a REST API.',
              prerequisites: 'TypeScript basics.',
              expectedActivity: 'Build a CRUD API.',
              order: 2,
              skills: [
                {
                  id: 'skill-nest',
                  name: 'NestJS',
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
                  certificationCost: '0.00',
                  curationRationale: 'Official documentation.',
                  lastCheckedDate: new Date('2026-01-01'),
                  skills: [
                    {
                      id: 'skill-nest',
                      name: 'NestJS',
                    },
                  ],
                },
              ],
            },
            {
              id: 'step-1',
              title: 'Learn TypeScript',
              description: null,
              learningObjective: 'Use TypeScript basics.',
              prerequisites: null,
              expectedActivity: 'Complete an exercise.',
              order: 1,
              skills: [
                {
                  id: 'skill-ts',
                  name: 'TypeScript',
                },
              ],
              resources: [],
            },
          ],
        },
      });
    });

    it('should verify the career is published before loading the pathway', async () => {
      await service.getCareerPathway('career-1');

      expect(mockPrismaService.career.findFirst).toHaveBeenCalledWith({
        where: {
          id: 'career-1',
          status: CareerStatus.PUBLISHED,
        },
        select: {
          id: true,
        },
      });

      expect(mockPrismaService.pathway.findUnique).toHaveBeenCalled();
    });

    it('should load the pathway by careerId and order steps ascending', async () => {
      await service.getCareerPathway('career-1');

      expect(mockPrismaService.pathway.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            careerId: 'career-1',
          },
          select: expect.objectContaining({
            id: true,
            careerId: true,
            title: true,
            description: true,
            steps: expect.objectContaining({
              orderBy: {
                order: 'asc',
              },
            }),
          }),
        }),
      );
    });

    it('should only include ACTIVE resources', async () => {
      await service.getCareerPathway('career-1');

      const call = mockPrismaService.pathway.findUnique.mock.calls[0][0] as {
        select: {
          steps: {
            select: {
              resources: {
                where: unknown;
              };
            };
          };
        };
      };

      expect(call.select.steps.select.resources.where).toEqual({
        resource: {
          status: ResourceStatus.ACTIVE,
        },
      });
    });

    it('should return null pathway when the career has no pathway', async () => {
      mockPrismaService.pathway.findUnique.mockResolvedValue(null);

      const result = await service.getCareerPathway('career-1');

      expect(result).toEqual({
        pathway: null,
      });
    });

    it('should throw NotFoundException when the career does not exist', async () => {
      mockPrismaService.career.findFirst.mockResolvedValue(null);

      await expect(service.getCareerPathway('missing-career')).rejects.toThrow(
        NotFoundException,
      );

      expect(mockPrismaService.pathway.findUnique).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException when the career is not published', async () => {
      mockPrismaService.career.findFirst.mockResolvedValue(null);

      await expect(service.getCareerPathway('draft-career')).rejects.toThrow(
        NotFoundException,
      );

      expect(mockPrismaService.pathway.findUnique).not.toHaveBeenCalled();
    });
  });
});
