import { jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { CareersService } from './careers.service';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CareerStatus,
  Demand,
  OutlookType,
  TargetLevel,
} from '../../generated/prisma/client';
import { GetCareersQueryDto } from './dto/get-careers-query.dto';
import { ConflictException, Logger, NotFoundException } from '@nestjs/common';
import { Prisma, RevisionStatus } from '../../generated/prisma/client';
import { AnalyticsService } from '../../analytics';
import { DomainException } from '../../common';
import type { CreateCareerDto } from './dto/create-career.dto';

describe('CareersService', () => {
  let service: CareersService;

  const mockPrismaService = {
    career: {
      findMany: jest.fn<
        () => Promise<
          {
            id: string;
            slug: string;
            title: string;
            description: string;
          }[]
        >
      >(),
      findFirst: jest.fn<(args: unknown) => Promise<unknown>>(),
      findUnique: jest.fn<
        (args: unknown) => Promise<{
          status: CareerStatus;
          publishedAt: Date | null;
          _count: { userPathways: number };
        } | null>
      >(),
      delete: jest.fn<(args: unknown) => Promise<{ id: string }>>(),
      create: jest.fn<(args: unknown) => Promise<unknown>>(),
    },
    field: {
      findUnique: jest.fn<(args: unknown) => Promise<{ id: string } | null>>(),
    },
  };

  const mockAnalyticsService = {
    capture: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CareersService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        { provide: AnalyticsService, useValue: mockAnalyticsService },
      ],
    }).compile();

    service = module.get<CareersService>(CareersService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getPublicCareers', () => {
    const mockDbCareers = [
      {
        id: '1',
        slug: 'software-engineer',
        title: 'Software Engineer',
        description: 'Builds software applications.',
      },
    ];

    it('should return mapped public careers without query filters', async () => {
      mockPrismaService.career.findMany.mockResolvedValue(mockDbCareers);

      const result = await service.getPublicCareers({});

      expect(mockPrismaService.career.findMany).toHaveBeenCalledWith({
        where: {
          status: CareerStatus.PUBLISHED,
        },
        select: {
          id: true,
          slug: true,
          title: true,
          description: true,
        },
        orderBy: {
          title: 'asc',
        },
      });

      expect(result).toEqual([
        {
          id: '1',
          slug: 'software-engineer',
          title: 'Software Engineer',
          shortDescription: 'Builds software applications.',
        },
      ]);
    });

    it('should apply level and interest filters correctly to where clause', async () => {
      mockPrismaService.career.findMany.mockResolvedValue(mockDbCareers);

      const query: GetCareersQueryDto = {
        level: TargetLevel.RECENT_GRAD,
        interest: 'software-engineering',
      };

      await service.getPublicCareers(query);

      expect(mockPrismaService.career.findMany).toHaveBeenCalledWith({
        where: {
          status: CareerStatus.PUBLISHED,
          targetLevels: { has: TargetLevel.RECENT_GRAD },
          field: { slug: 'software-engineering' },
        },
        select: {
          id: true,
          slug: true,
          title: true,
          description: true,
        },
        orderBy: {
          title: 'asc',
        },
      });
    });
  });

  describe('getPublishedCareerById', () => {
    const mockDbCareer = {
      id: 'career-1',
      slug: 'software-engineer',
      title: 'Software Engineer',
      description: 'Builds software applications.',
      roleSummary: 'Designs and builds software systems.',
      exampleActivities: ['Write code', 'Review PRs'],
      typicalEducationNote: null,
      certificationsNote: null,
      targetLevels: [TargetLevel.RECENT_GRAD],
      status: CareerStatus.PUBLISHED,
      publishedAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-02'),

      field: {
        name: 'Software Engineering',
        slug: 'software-engineering',
      },

      skills: [
        {
          skill: {
            id: 'skill-1',
            name: 'TypeScript',
          },
        },
      ],

      outlook: [
        {
          id: 'outlook-1',
          type: OutlookType.SALARY,
          geography: 'United States',
          source: 'Example Labour Stats',
          sourceUrl: null,
          period: '2026',
          median: { toString: () => '65000.00' },
          percentile25: null,
          percentile75: null,
          currency: 'USD',
          payPeriod: 'year',
          grossOrNet: 'gross',
          experienceLevel: 'entry-level',
          baseYear: null,
          baseValue: null,
          projectedYear: null,
          projectedValue: null,
          growthPercent: null,
          demandLevel: null as Demand | null,
          updatedAt: new Date('2026-01-02'),
        },
      ],

      pathway: {
        id: 'pathway-1',
        title: 'Backend Roadmap',
        _count: {
          steps: 3,
        },
      },
    };

    it('should return the published career with field, skills, outlook and pathway summary', async () => {
      mockPrismaService.career.findFirst.mockResolvedValue(mockDbCareer);

      const result = await service.getPublishedCareerById('career-1');

      expect(result).toEqual({
        id: 'career-1',
        slug: 'software-engineer',
        title: 'Software Engineer',
        description: 'Builds software applications.',
        roleSummary: 'Designs and builds software systems.',
        exampleActivities: ['Write code', 'Review PRs'],
        typicalEducationNote: null,
        certificationsNote: null,
        targetLevels: [TargetLevel.RECENT_GRAD],
        status: CareerStatus.PUBLISHED,
        publishedAt: new Date('2026-01-01'),
        updatedAt: new Date('2026-01-02'),

        field: {
          name: 'Software Engineering',
          slug: 'software-engineering',
        },

        skills: [
          {
            id: 'skill-1',
            name: 'TypeScript',
          },
        ],

        outlook: [
          expect.objectContaining({
            id: 'outlook-1',
            type: OutlookType.SALARY,
            median: '65000.00',
          }),
        ],

        pathway: {
          id: 'pathway-1',
          title: 'Backend Roadmap',
          stepCount: 3,
        },
      });
    });

    it('should query only the career fields and relationship data required by the detail response', async () => {
      mockPrismaService.career.findFirst.mockResolvedValue(mockDbCareer);

      await service.getPublishedCareerById('career-1');

      expect(mockPrismaService.career.findFirst).toHaveBeenCalledWith({
        where: {
          id: 'career-1',
          status: CareerStatus.PUBLISHED,
        },
        select: {
          id: true,
          slug: true,
          title: true,
          description: true,
          roleSummary: true,
          exampleActivities: true,
          typicalEducationNote: true,
          certificationsNote: true,
          targetLevels: true,
          status: true,
          publishedAt: true,
          updatedAt: true,

          field: {
            select: {
              name: true,
              slug: true,
            },
          },

          skills: {
            select: {
              skill: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },

          outlook: {
            select: {
              id: true,
              type: true,
              geography: true,
              source: {
                select: {
                  name: true,
                  url: true,
                },
              },
              period: true,
              median: true,
              percentile25: true,
              percentile75: true,
              currency: true,
              payPeriod: true,
              grossOrNet: true,
              experienceLevel: true,
              baseYear: true,
              baseValue: true,
              projectedYear: true,
              projectedValue: true,
              growthPercent: true,
              demandLevel: true,
              updatedAt: true,
            },
          },

          pathway: {
            select: {
              id: true,
              title: true,
              _count: {
                select: {
                  steps: true,
                },
              },
            },
          },
        },
      });
    });

    it('should return a pathway summary without loading pathway steps', async () => {
      mockPrismaService.career.findFirst.mockResolvedValue(mockDbCareer);

      const result = await service.getPublishedCareerById('career-1');

      expect(result.pathway).toEqual({
        id: 'pathway-1',
        title: 'Backend Roadmap',
        stepCount: 3,
      });

      expect(result.pathway).not.toHaveProperty('steps');
      expect(result.pathway).not.toHaveProperty('resources');
    });

    it('should return an empty role summary when none is stored', async () => {
      mockPrismaService.career.findFirst.mockResolvedValue({
        ...mockDbCareer,
        roleSummary: null,
      });

      const result = await service.getPublishedCareerById('career-1');

      expect(result.roleSummary).toBe('');
    });

    it('should return null pathway when the career has no pathway', async () => {
      mockPrismaService.career.findFirst.mockResolvedValue({
        ...mockDbCareer,
        pathway: null,
      });

      const result = await service.getPublishedCareerById('career-1');

      expect(result.pathway).toBeNull();
    });

    it('should throw NotFoundException when the career does not exist', async () => {
      mockPrismaService.career.findFirst.mockResolvedValue(null);

      await expect(
        service.getPublishedCareerById('missing-career'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when the career is not published', async () => {
      // Because the query filters by PUBLISHED status, Prisma returns null
      // for DRAFT and RETIRED careers.
      mockPrismaService.career.findFirst.mockResolvedValue(null);

      await expect(
        service.getPublishedCareerById('draft-career'),
      ).rejects.toThrow(NotFoundException);

      await expect(
        service.getPublishedCareerById('retired-career'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getTargetLevels', () => {
    it('should return every target level as its string value', () => {
      const result = service.getTargetLevels();

      expect(result).toEqual(['STUDENT', 'RECENT_GRAD', 'EARLY_CAREER']);
    });

    it('should not query the database', () => {
      service.getTargetLevels();

      expect(mockPrismaService.career.findMany).not.toHaveBeenCalled();
      expect(mockPrismaService.career.findFirst).not.toHaveBeenCalled();
    });
  });

  describe('createCareer', () => {
    let logSpy: jest.SpiedFunction<Logger['log']>;
    let warnSpy: jest.SpiedFunction<Logger['warn']>;

    const dto: CreateCareerDto = {
      title: 'DevOps Engineer',
      slug: 'devops-engineer',
      fieldId: 'field-1',
      description: 'Automates how software is built, tested and deployed.',
    };

    const createdAt = new Date('2026-10-28T10:30:00.000Z');
    const created = {
      id: 'career-1',
      slug: 'devops-engineer',
      title: 'DevOps Engineer',
      description: 'Automates how software is built, tested and deployed.',
      roleSummary: null,
      fieldId: 'field-1',
      targetLevels: [],
      status: CareerStatus.DRAFT,
      version: 1,
      createdAt,
      revisions: [
        { id: 'revision-1', status: RevisionStatus.DRAFT, baseVersion: 1 },
      ],
    };

    const prismaError = (code: string) =>
      new Prisma.PrismaClientKnownRequestError('failed', {
        code,
        clientVersion: 'test',
      });

    beforeEach(() => {
      mockPrismaService.field.findUnique.mockResolvedValue({ id: 'field-1' });
      mockPrismaService.career.findFirst.mockResolvedValue(null);
      mockPrismaService.career.create.mockResolvedValue(created);
      logSpy = jest
        .spyOn(Logger.prototype, 'log')
        .mockImplementation(() => undefined);
      warnSpy = jest
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation(() => undefined);
    });

    afterEach(() => {
      logSpy.mockRestore();
      warnSpy.mockRestore();
    });

    it('creates a DRAFT career at version 1 with its first DRAFT revision', async () => {
      await service.createCareer(dto, 'editor-1');

      expect(mockPrismaService.career.create).toHaveBeenCalledWith({
        data: {
          title: 'DevOps Engineer',
          slug: 'devops-engineer',
          description: 'Automates how software is built, tested and deployed.',
          roleSummary: null,
          fieldId: 'field-1',
          targetLevels: [],
          status: CareerStatus.DRAFT,
          version: 1,
          revisions: {
            create: {
              baseVersion: 1,
              createdById: 'editor-1',
              snapshot: {
                schemaVersion: 1,
                career: {
                  title: 'DevOps Engineer',
                  slug: 'devops-engineer',
                  description:
                    'Automates how software is built, tested and deployed.',
                  roleSummary: null,
                  fieldId: 'field-1',
                  targetLevels: [],
                  exampleActivities: [],
                  typicalEducationNote: null,
                  certificationsNote: null,
                },
                pathway: null,
                steps: [],
                skills: [],
                outlook: [],
                resources: [],
              },
            },
          },
        },
        select: {
          id: true,
          slug: true,
          title: true,
          description: true,
          roleSummary: true,
          fieldId: true,
          targetLevels: true,
          status: true,
          version: true,
          createdAt: true,
          revisions: { select: { id: true, status: true, baseVersion: true } },
        },
      });
    });

    it('passes the optional role summary and target levels through', async () => {
      await service.createCareer(
        {
          ...dto,
          roleSummary: 'Runs the delivery pipelines.',
          targetLevels: [TargetLevel.RECENT_GRAD],
        },
        'editor-1',
      );

      const [[args]] = mockPrismaService.career.create.mock.calls as [
        [
          {
            data: {
              roleSummary: string | null;
              targetLevels: TargetLevel[];
              revisions: {
                create: {
                  snapshot: {
                    career: {
                      roleSummary: string | null;
                      targetLevels: TargetLevel[];
                    };
                  };
                };
              };
            };
          },
        ],
      ];
      expect(args.data.roleSummary).toBe('Runs the delivery pipelines.');
      expect(args.data.targetLevels).toEqual([TargetLevel.RECENT_GRAD]);
      expect(args.data.revisions.create.snapshot.career).toEqual(
        expect.objectContaining({
          roleSummary: 'Runs the delivery pipelines.',
          targetLevels: [TargetLevel.RECENT_GRAD],
        }),
      );
    });

    it('returns the career with its revision and logs ids only', async () => {
      const result = await service.createCareer(dto, 'editor-1');

      expect(result).toEqual({
        id: 'career-1',
        slug: 'devops-engineer',
        title: 'DevOps Engineer',
        description: 'Automates how software is built, tested and deployed.',
        roleSummary: null,
        fieldId: 'field-1',
        targetLevels: [],
        status: CareerStatus.DRAFT,
        version: 1,
        createdAt,
        revision: {
          id: 'revision-1',
          status: RevisionStatus.DRAFT,
          baseVersion: 1,
        },
      });
      expect(logSpy).toHaveBeenCalledWith(
        {
          careerId: 'career-1',
          revisionId: 'revision-1',
          actorUserId: 'editor-1',
        },
        'Career draft created',
      );
      expect(mockAnalyticsService.capture).not.toHaveBeenCalled();
    });

    it('checks title and slug ignoring case', async () => {
      await service.createCareer(dto, 'editor-1');

      expect(mockPrismaService.career.findFirst).toHaveBeenCalledWith({
        where: { title: { equals: 'DevOps Engineer', mode: 'insensitive' } },
        select: { id: true },
      });
      expect(mockPrismaService.career.findFirst).toHaveBeenCalledWith({
        where: { slug: { equals: 'devops-engineer', mode: 'insensitive' } },
        select: { id: true },
      });
    });

    it('rejects an unknown field with FIELD_NOT_FOUND before checking names', async () => {
      mockPrismaService.field.findUnique.mockResolvedValue(null);

      await expect(service.createCareer(dto, 'editor-1')).rejects.toMatchObject(
        {
          code: 'FIELD_NOT_FOUND',
          message: 'Field not found',
        },
      );
      expect(mockPrismaService.career.findFirst).not.toHaveBeenCalled();
      expect(mockPrismaService.career.create).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalledWith(
        {
          fieldId: 'field-1',
          actorUserId: 'editor-1',
          reason: 'FIELD_NOT_FOUND',
        },
        'Career draft rejected',
      );
    });

    it.each([
      [
        'title',
        { id: 'other' },
        null,
        'CAREER_TITLE_TAKEN',
        'A career with this title already exists',
      ],
      [
        'slug',
        null,
        { id: 'other' },
        'CAREER_SLUG_TAKEN',
        'A career with this slug already exists',
      ],
      [
        'title before slug',
        { id: 'other' },
        { id: 'another' },
        'CAREER_TITLE_TAKEN',
        'A career with this title already exists',
      ],
    ])(
      'rejects a taken %s with a 409 and creates nothing',
      async (_label, titleTaken, slugTaken, code, message) => {
        mockPrismaService.career.findFirst
          .mockResolvedValueOnce(titleTaken)
          .mockResolvedValueOnce(slugTaken);

        const error = await service
          .createCareer(dto, 'editor-1')
          .catch((e: unknown) => e);

        expect(error).toBeInstanceOf(DomainException);
        expect(error).toMatchObject({ code, message });
        expect((error as DomainException).getStatus()).toBe(409);
        expect(mockPrismaService.career.create).not.toHaveBeenCalled();
        expect(warnSpy).toHaveBeenCalledWith(
          { actorUserId: 'editor-1', reason: code },
          'Career draft rejected',
        );
      },
    );

    it('maps a unique violation from a concurrent create to the taken code', async () => {
      mockPrismaService.career.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 'raced' });
      mockPrismaService.career.create.mockRejectedValue(prismaError('P2002'));

      await expect(service.createCareer(dto, 'editor-1')).rejects.toMatchObject(
        { code: 'CAREER_SLUG_TAKEN' },
      );
    });

    it('rethrows a unique violation it cannot attribute', async () => {
      const failure = prismaError('P2002');
      mockPrismaService.career.create.mockRejectedValue(failure);

      await expect(service.createCareer(dto, 'editor-1')).rejects.toBe(failure);
    });

    it('maps a foreign key violation to FIELD_NOT_FOUND', async () => {
      mockPrismaService.career.create.mockRejectedValue(prismaError('P2003'));

      await expect(service.createCareer(dto, 'editor-1')).rejects.toMatchObject(
        { code: 'FIELD_NOT_FOUND' },
      );
    });

    it('rethrows unexpected database errors', async () => {
      const failure = new Error('connection lost');
      mockPrismaService.career.create.mockRejectedValue(failure);

      await expect(service.createCareer(dto, 'editor-1')).rejects.toBe(failure);
      expect(logSpy).not.toHaveBeenCalled();
    });
  });

  describe('deleteCareer', () => {
    let logSpy: jest.SpiedFunction<Logger['log']>;
    let warnSpy: jest.SpiedFunction<Logger['warn']>;

    const notFound = () =>
      new Prisma.PrismaClientKnownRequestError('No record was found', {
        code: 'P2025',
        clientVersion: 'test',
      });

    beforeEach(() => {
      mockPrismaService.career.delete.mockResolvedValue({ id: 'career-1' });
      logSpy = jest
        .spyOn(Logger.prototype, 'log')
        .mockImplementation(() => undefined);
      warnSpy = jest
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation(() => undefined);
    });

    afterEach(() => {
      logSpy.mockRestore();
      warnSpy.mockRestore();
    });

    it('deletes only a never-published draft that no user has saved', async () => {
      const result = await service.deleteCareer('career-1', 'admin-1');

      expect(mockPrismaService.career.delete).toHaveBeenCalledWith({
        where: {
          id: 'career-1',
          status: CareerStatus.DRAFT,
          publishedAt: null,
          userPathways: { none: {} },
        },
        select: { id: true },
      });
      expect(mockPrismaService.career.findUnique).not.toHaveBeenCalled();
      expect(result).toEqual({ message: 'Career deleted' });
    });

    it('logs the career and actor ids and emits career_deleted', async () => {
      await service.deleteCareer('career-1', 'admin-1');

      expect(logSpy).toHaveBeenCalledWith(
        { careerId: 'career-1', actorUserId: 'admin-1' },
        'Career deleted',
      );
      expect(mockAnalyticsService.capture).toHaveBeenCalledWith(
        'career_deleted',
        'admin-1',
        { careerId: 'career-1' },
      );
    });

    it('throws NotFoundException when no career has the id', async () => {
      mockPrismaService.career.delete.mockRejectedValue(notFound());
      mockPrismaService.career.findUnique.mockResolvedValue(null);

      await expect(service.deleteCareer('missing', 'admin-1')).rejects.toThrow(
        new NotFoundException('Career not found'),
      );
      expect(warnSpy).not.toHaveBeenCalled();
      expect(mockAnalyticsService.capture).not.toHaveBeenCalled();
    });

    const publishedAt = new Date('2026-10-01T00:00:00.000Z');

    it.each([
      ['a published career', CareerStatus.PUBLISHED, publishedAt, 0],
      ['a retired career', CareerStatus.RETIRED, publishedAt, 3],
      ['a draft that was published before', CareerStatus.DRAFT, publishedAt, 0],
      ['a draft a user has saved', CareerStatus.DRAFT, null, 1],
    ] as const)(
      'throws ConflictException and warns with what blocked it for %s',
      async (_label, status, everPublishedAt, userPathways) => {
        mockPrismaService.career.delete.mockRejectedValue(notFound());
        mockPrismaService.career.findUnique.mockResolvedValue({
          status,
          publishedAt: everPublishedAt,
          _count: { userPathways },
        });

        await expect(
          service.deleteCareer('career-1', 'admin-1'),
        ).rejects.toThrow(
          new ConflictException(
            'Only a draft career that was never published or saved can be deleted',
          ),
        );
        expect(warnSpy).toHaveBeenCalledWith(
          {
            careerId: 'career-1',
            actorUserId: 'admin-1',
            status,
            everPublished: everPublishedAt !== null,
            savedPathways: userPathways,
            reason: 'CAREER_HAS_HISTORY',
          },
          'Career delete rejected',
        );
        expect(logSpy).not.toHaveBeenCalled();
        expect(mockAnalyticsService.capture).not.toHaveBeenCalled();
      },
    );

    it('rethrows unexpected database errors', async () => {
      const failure = new Error('connection lost');
      mockPrismaService.career.delete.mockRejectedValue(failure);

      await expect(service.deleteCareer('career-1', 'admin-1')).rejects.toBe(
        failure,
      );
      expect(mockPrismaService.career.findUnique).not.toHaveBeenCalled();
    });
  });
});
