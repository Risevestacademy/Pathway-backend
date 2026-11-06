import { jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import {
  OpportunityType,
  OpportunityVerification,
} from '../generated/prisma/client';
import { PrismaService } from '../prisma';
import type { GetOpportunitiesQueryDto } from './dto/get-opportunities-query.dto';
import { OpportunitiesService } from './opportunities.service';
import {
  buildOpportunityListWhere,
  OPPORTUNITY_LIST_ORDER_BY,
  OPPORTUNITY_LIST_SELECT,
} from './opportunity-list';

describe('OpportunitiesService', () => {
  let service: OpportunitiesService;

  const now = new Date('2026-11-06T12:00:00.000Z');
  const mockPrisma = {
    opportunity: {
      findMany: jest.fn<(args: unknown) => Promise<unknown[]>>(),
    },
  };

  const row = {
    id: 'opp-1',
    title: 'Intern',
    type: OpportunityType.INTERNSHIP,
    organisation: 'Org',
    location: 'Remote',
    description: 'Short.',
    verification: OpportunityVerification.VERIFIED,
    deadline: new Date('2026-12-06T12:00:00.000Z'),
    deadlineUnknown: false,
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    jest.useFakeTimers({ now });
    mockPrisma.opportunity.findMany.mockResolvedValue([row]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OpportunitiesService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get(OpportunitiesService);
  });

  afterEach(() => {
    jest.useRealTimers();
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

      expect(mockPrisma.opportunity.findMany).toHaveBeenCalledWith({
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
          deadline: row.deadline,
          summary: 'Short.',
        },
      ]);
    });

    it('returns an empty array when nothing matches', async () => {
      mockPrisma.opportunity.findMany.mockResolvedValue([]);

      await expect(service.listOpportunities(query)).resolves.toEqual([]);
    });
  });
});
