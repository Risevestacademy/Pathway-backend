import { jest } from '@jest/globals';
import { Logger, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AnalyticsService } from '../../analytics';
import { DomainException } from '../../common';
import { CareerStatus } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma';
import { CareersService } from './careers.service';

describe('CareersService.retireCareer', () => {
  let service: CareersService;
  let logSpy: jest.SpiedFunction<Logger['log']>;
  let warnSpy: jest.SpiedFunction<Logger['warn']>;

  const tx = {
    $queryRaw: jest.fn<(...args: unknown[]) => Promise<unknown[]>>(),
    career: { update: jest.fn<(args: unknown) => Promise<unknown>>() },
  };
  const mockPrisma = {
    $transaction: jest.fn(
      <T>(callback: (client: typeof tx) => Promise<T>): Promise<T> =>
        callback(tx),
    ),
  };
  const analytics = { capture: jest.fn() };

  const retired = {
    id: 'career-1',
    status: CareerStatus.RETIRED,
    version: 4,
    updatedAt: new Date('2026-10-30T10:00:00.000Z'),
  };

  const failure = (promise: Promise<unknown>) =>
    promise.catch((e: unknown) => e) as Promise<DomainException>;

  beforeEach(async () => {
    jest.clearAllMocks();
    tx.$queryRaw.mockResolvedValue([{ status: CareerStatus.PUBLISHED }]);
    tx.career.update.mockResolvedValue(retired);
    logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CareersService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AnalyticsService, useValue: analytics },
      ],
    }).compile();

    service = module.get(CareersService);
  });

  afterEach(() => {
    logSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it('locks the row and sets only the status', async () => {
    const result = await service.retireCareer('career-1', 'publisher-1');

    const [strings] = tx.$queryRaw.mock.calls[0] as [TemplateStringsArray];
    expect(strings.join('?')).toContain('FOR UPDATE');
    expect(tx.career.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'career-1' },
        data: { status: CareerStatus.RETIRED },
      }),
    );
    expect(result).toBe(retired);
  });

  it('logs and emits career_status_changed after the write', async () => {
    await service.retireCareer('career-1', 'publisher-1');

    expect(logSpy).toHaveBeenCalledWith(
      { careerId: 'career-1', actorUserId: 'publisher-1' },
      'Career retired',
    );
    expect(analytics.capture).toHaveBeenCalledWith(
      'career_status_changed',
      'publisher-1',
      { oldStatus: CareerStatus.PUBLISHED, newStatus: CareerStatus.RETIRED },
    );
    expect(analytics.capture.mock.invocationCallOrder[0]).toBeGreaterThan(
      tx.career.update.mock.invocationCallOrder[0],
    );
  });

  it.each([CareerStatus.DRAFT, CareerStatus.RETIRED])(
    'rejects a %s career with CAREER_NOT_PUBLISHED and changes nothing',
    async (status) => {
      tx.$queryRaw.mockResolvedValue([{ status }]);

      const error = await failure(
        service.retireCareer('career-1', 'publisher-1'),
      );

      expect(error).toBeInstanceOf(DomainException);
      expect(error).toMatchObject({ code: 'CAREER_NOT_PUBLISHED' });
      expect(error.getStatus()).toBe(409);
      expect(tx.career.update).not.toHaveBeenCalled();
      expect(analytics.capture).not.toHaveBeenCalled();
    },
  );

  it('throws NotFoundException for an unknown career', async () => {
    tx.$queryRaw.mockResolvedValue([]);

    await expect(
      service.retireCareer('missing', 'publisher-1'),
    ).rejects.toThrow(new NotFoundException('Career not found'));
    expect(tx.career.update).not.toHaveBeenCalled();
    expect(analytics.capture).not.toHaveBeenCalled();
  });
});
