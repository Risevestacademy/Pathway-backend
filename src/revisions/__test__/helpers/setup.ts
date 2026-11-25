import { beforeEach, afterEach, jest } from '@jest/globals';
import { Logger } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PublishingService } from '../../publishing.service';
import { PrismaService } from '../../../prisma';
import { AnalyticsService } from '../../../analytics';
import {
  makePrismaMock,
  makeTxMock,
  type PrismaMock,
  type TxMock,
} from './mocks';
import {
  fakeCareerStrategy,
  fakeResourceStrategy,
  registerTestStrategies,
  resetFakeStrategy,
} from './strategy';

export type PublishingTestContext = {
  service: PublishingService;
  txMock: TxMock;
  prismaMock: PrismaMock;
  analyticsMock: { capture: jest.Mock };
  logSpy: jest.SpiedFunction<Logger['log']>;
  warnSpy: jest.SpiedFunction<Logger['warn']>;
  fakeCareerStrategy: typeof fakeCareerStrategy;
  fakeResourceStrategy: typeof fakeResourceStrategy;
};

/**
 * Wire up the per-test scaffolding for a PublishingService spec.
 *
 * Call once at the top of each spec's top-level `describe`. Returns a getter
 * — the context is created fresh in `beforeEach`, so tests read `ctx().service`
 * rather than destructuring at spec-definition time.
 */
export const usePublishingTestContext = (): (() => PublishingTestContext) => {
  let ctx: PublishingTestContext;

  beforeAll(() => {
    registerTestStrategies();
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    const txMock = makeTxMock();
    const prismaMock = makePrismaMock(txMock);
    const analyticsMock = { capture: jest.fn() };

    resetFakeStrategy(fakeCareerStrategy);
    resetFakeStrategy(fakeResourceStrategy);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PublishingService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: AnalyticsService, useValue: analyticsMock },
      ],
    }).compile();

    const service = module.get<PublishingService>(PublishingService);

    const logSpy = jest
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined);
    const warnSpy = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);

    ctx = {
      service,
      txMock,
      prismaMock,
      analyticsMock,
      logSpy,
      warnSpy,
      fakeCareerStrategy,
      fakeResourceStrategy,
    };

    // Stash spies so afterEach can restore even if a test throws mid-way.
    (ctx as unknown as { _spies: jest.SpiedFunction<never>[] })._spies = [
      logSpy,
      warnSpy,
    ] as never;
  });

  afterEach(() => {
    const spies = (ctx as unknown as { _spies?: jest.SpiedFunction<never>[] })
      ._spies;
    spies?.forEach((s) => s.mockRestore());
  });

  return () => ctx;
};
