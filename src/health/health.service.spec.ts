import { Logger } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { jest } from '@jest/globals';
import { HealthService } from './health.service';
import { PrismaService } from '../prisma';

describe('HealthService', () => {
  let service: HealthService;
  let queryRaw: jest.Mock<() => Promise<unknown>>;

  beforeEach(async () => {
    queryRaw = jest.fn<() => Promise<unknown>>();
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HealthService,
        { provide: PrismaService, useValue: { $queryRaw: queryRaw } },
      ],
    }).compile();

    service = module.get<HealthService>(HealthService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('check', () => {
    it('queries the database instead of assuming it is reachable', async () => {
      queryRaw.mockResolvedValue([{ '?column?': 1 }]);

      await service.check();

      expect(queryRaw).toHaveBeenCalledTimes(1);
    });

    it('reports ok when the database responds', async () => {
      queryRaw.mockResolvedValue([{ '?column?': 1 }]);

      const report = await service.check();

      expect(report.status).toBe('ok');
      expect(report.checks.database.status).toBe('up');
    });

    it('reports error when the database is unreachable', async () => {
      queryRaw.mockRejectedValue(new Error('connection refused'));

      const report = await service.check();

      expect(report.status).toBe('error');
      expect(report.checks.database.status).toBe('down');
    });

    it('keeps database failure details out of the report', async () => {
      queryRaw.mockRejectedValue(new Error('connection refused'));

      const report = await service.check();

      expect(JSON.stringify(report)).not.toContain('connection refused');
    });

    it('logs the underlying failure when the database is unreachable', async () => {
      const failure = new Error('connection refused');
      queryRaw.mockRejectedValue(failure);

      await service.check();

      expect(Logger.prototype.error).toHaveBeenCalledWith(
        'Database health check failed',
        failure.stack,
      );
    });

    it('reports uptime in seconds and an ISO timestamp', async () => {
      queryRaw.mockResolvedValue([{ '?column?': 1 }]);

      const report = await service.check();

      expect(report.uptime).toBeGreaterThanOrEqual(0);
      expect(Number.isInteger(report.uptime)).toBe(true);
      expect(new Date(report.timestamp).toISOString()).toBe(report.timestamp);
    });
  });
});
