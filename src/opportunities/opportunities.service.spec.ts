import { jest } from '@jest/globals';
import { Logger, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  OpportunityType,
  OpportunityVerification,
} from '../generated/prisma/client';
import { PathwaysService } from '../catalog/pathways';
import { PrismaService } from '../prisma';
import type { GetOpportunitiesQueryDto } from './dto/get-opportunities-query.dto';
import { OpportunitiesService } from './opportunities.service';
import {
  buildOpportunityListWhere,
  OPPORTUNITY_LIST_ORDER_BY,
  OPPORTUNITY_LIST_SELECT,
} from './opportunity-list';

type OpportunityState = {
  verification: 'DRAFT' | 'VERIFIED' | 'WITHDRAWN';
  deadline: Date | null;
  deadlineUnknown: boolean;
};

describe('OpportunitiesService', () => {
  let service: OpportunitiesService;
  let logSpy: jest.SpiedFunction<Logger['log']>;
  let warnSpy: jest.SpiedFunction<Logger['warn']>;

  const now = new Date('2026-11-06T12:00:00.000Z');
  const later = new Date('2026-12-06T12:00:00.000Z');
  const minuteAgo = new Date('2026-11-06T11:59:00.000Z');
  const savedAt = new Date('2026-11-01T12:00:00.000Z');
  const userId = 'user-1';
  const opportunityId = 'opportunity-1';

  const listRow = {
    id: 'opp-1',
    title: 'Intern',
    type: OpportunityType.INTERNSHIP,
    organisation: 'Org',
    location: 'Remote',
    description: 'Short.',
    verification: OpportunityVerification.VERIFIED,
    deadline: later,
    deadlineUnknown: false,
  };

  const mockPrismaService = {
    opportunity: {
      findUnique:
        jest.fn<(args: unknown) => Promise<OpportunityState | null>>(),
      findMany: jest.fn<(args: unknown) => Promise<unknown[]>>(),
    },
    userSavedOpportunity: {
      createMany: jest.fn<(args: unknown) => Promise<{ count: number }>>(),
      findUniqueOrThrow:
        jest.fn<(args: unknown) => Promise<{ savedAt: Date }>>(),
      deleteMany: jest.fn<(args: unknown) => Promise<{ count: number }>>(),
    },
  };

  const mockPathwaysService = {
    getActivePathway:
      jest.fn<(userId: string) => Promise<{ career: { id: string } | null }>>(),
  };

  const visible: OpportunityState = {
    verification: 'VERIFIED',
    deadline: later,
    deadlineUnknown: false,
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    jest.useFakeTimers({ now, doNotFake: ['nextTick', 'setImmediate'] });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OpportunitiesService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: PathwaysService, useValue: mockPathwaysService },
      ],
    }).compile();

    service = module.get<OpportunitiesService>(OpportunitiesService);
    logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    mockPrismaService.userSavedOpportunity.findUniqueOrThrow.mockResolvedValue({
      savedAt,
    });
    mockPrismaService.opportunity.findMany.mockResolvedValue([listRow]);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('listOpportunities', () => {
    const query: GetOpportunitiesQueryDto = {
      type: OpportunityType.INTERNSHIP,
      careerId: 'career-1',
      page: 3,
      limit: 10,
    };

    it('queries visible listings with the filters, order and page', async () => {
      await service.listOpportunities(query);

      expect(mockPrismaService.opportunity.findMany).toHaveBeenCalledWith({
        where: buildOpportunityListWhere(query, now),
        orderBy: OPPORTUNITY_LIST_ORDER_BY,
        skip: 20,
        take: 10,
        select: OPPORTUNITY_LIST_SELECT,
      });
    });

    it('maps each row to a list item', async () => {
      await expect(service.listOpportunities(query)).resolves.toEqual([
        {
          id: 'opp-1',
          title: 'Intern',
          type: OpportunityType.INTERNSHIP,
          organisation: 'Org',
          location: 'Remote',
          status: 'OPEN',
          deadline: listRow.deadline,
          summary: 'Short.',
        },
      ]);
    });

    it('returns an empty array when nothing matches', async () => {
      mockPrismaService.opportunity.findMany.mockResolvedValue([]);

      await expect(service.listOpportunities(query)).resolves.toEqual([]);
    });
  });

  describe('listMyOpportunities with scope pathway', () => {
    it("queries visible listings for the active pathway's career, unpaged", async () => {
      mockPathwaysService.getActivePathway.mockResolvedValue({
        career: { id: 'career-1' },
      });

      await service.listMyOpportunities(userId, 'pathway');

      expect(mockPathwaysService.getActivePathway).toHaveBeenCalledWith(userId);
      expect(mockPrismaService.opportunity.findMany).toHaveBeenCalledWith({
        where: buildOpportunityListWhere({ careerId: 'career-1' }, now),
        orderBy: OPPORTUNITY_LIST_ORDER_BY,
        select: OPPORTUNITY_LIST_SELECT,
      });
    });

    it('maps each row to a list item', async () => {
      mockPathwaysService.getActivePathway.mockResolvedValue({
        career: { id: 'career-1' },
      });

      await expect(
        service.listMyOpportunities(userId, 'pathway'),
      ).resolves.toEqual([
        {
          id: 'opp-1',
          title: 'Intern',
          type: OpportunityType.INTERNSHIP,
          organisation: 'Org',
          location: 'Remote',
          status: 'OPEN',
          deadline: listRow.deadline,
          summary: 'Short.',
        },
      ]);
    });

    it('returns an empty array without querying when there is no active pathway', async () => {
      mockPathwaysService.getActivePathway.mockResolvedValue({ career: null });

      await expect(
        service.listMyOpportunities(userId, 'pathway'),
      ).resolves.toEqual([]);
      expect(mockPrismaService.opportunity.findMany).not.toHaveBeenCalled();
    });
  });

  describe('saveOpportunity', () => {
    it('should insert the save, log it and return savedAt', async () => {
      mockPrismaService.opportunity.findUnique.mockResolvedValue(visible);
      mockPrismaService.userSavedOpportunity.createMany.mockResolvedValue({
        count: 1,
      });

      const result = await service.saveOpportunity(userId, opportunityId);

      expect(
        mockPrismaService.userSavedOpportunity.createMany,
      ).toHaveBeenCalledWith({
        data: [{ userId, opportunityId }],
        skipDuplicates: true,
      });
      expect(result).toEqual({ opportunityId, savedAt });
      expect(logSpy).toHaveBeenCalledWith(
        { userId, opportunityId },
        'Opportunity saved',
      );
    });

    it('should return the existing savedAt without logging on a repeat save', async () => {
      mockPrismaService.opportunity.findUnique.mockResolvedValue(visible);
      mockPrismaService.userSavedOpportunity.createMany.mockResolvedValue({
        count: 0,
      });

      const result = await service.saveOpportunity(userId, opportunityId);

      expect(result).toEqual({ opportunityId, savedAt });
      expect(logSpy).not.toHaveBeenCalled();
    });

    it('should save a verified listing with an unknown deadline', async () => {
      mockPrismaService.opportunity.findUnique.mockResolvedValue({
        verification: 'VERIFIED',
        deadline: null,
        deadlineUnknown: true,
      });
      mockPrismaService.userSavedOpportunity.createMany.mockResolvedValue({
        count: 1,
      });

      await service.saveOpportunity(userId, opportunityId);

      expect(
        mockPrismaService.userSavedOpportunity.createMany,
      ).toHaveBeenCalled();
    });

    it.each<[string, OpportunityState | null, string]>([
      ['unknown', null, 'OPPORTUNITY_NOT_FOUND'],
      [
        'draft',
        { ...visible, verification: 'DRAFT' },
        'OPPORTUNITY_NOT_VISIBLE',
      ],
      [
        'withdrawn',
        { ...visible, verification: 'WITHDRAWN' },
        'OPPORTUNITY_NOT_VISIBLE',
      ],
      [
        'closed',
        { ...visible, deadline: minuteAgo },
        'OPPORTUNITY_NOT_VISIBLE',
      ],
    ])(
      'should reject a %s listing with 404',
      async (_label, opportunity, reason) => {
        mockPrismaService.opportunity.findUnique.mockResolvedValue(opportunity);

        await expect(
          service.saveOpportunity(userId, opportunityId),
        ).rejects.toBeInstanceOf(NotFoundException);

        expect(
          mockPrismaService.userSavedOpportunity.createMany,
        ).not.toHaveBeenCalled();
        expect(warnSpy).toHaveBeenCalledWith(
          { userId, opportunityId, reason },
          'Opportunity save rejected',
        );
      },
    );
  });

  describe('unsaveOpportunity', () => {
    it("should delete only the user's save and log it", async () => {
      mockPrismaService.userSavedOpportunity.deleteMany.mockResolvedValue({
        count: 1,
      });

      await service.unsaveOpportunity(userId, opportunityId);

      expect(
        mockPrismaService.userSavedOpportunity.deleteMany,
      ).toHaveBeenCalledWith({ where: { userId, opportunityId } });
      expect(logSpy).toHaveBeenCalledWith(
        { userId, opportunityId },
        'Opportunity unsaved',
      );
    });

    it('should resolve without logging when there is no save to remove', async () => {
      mockPrismaService.userSavedOpportunity.deleteMany.mockResolvedValue({
        count: 0,
      });

      await expect(
        service.unsaveOpportunity(userId, opportunityId),
      ).resolves.toBeUndefined();

      expect(logSpy).not.toHaveBeenCalled();
    });
  });
});
