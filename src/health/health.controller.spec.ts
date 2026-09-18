import { HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { jest } from '@jest/globals';
import type { Response } from 'express';
import { HealthController } from './health.controller';
import { HealthReport, HealthService } from './health.service';

describe('HealthController', () => {
  let controller: HealthController;
  let service: HealthService;
  let response: Response;

  const healthy: HealthReport = {
    status: 'ok',
    uptime: 12,
    timestamp: '2026-09-18T10:00:00.000Z',
    checks: { database: { status: 'up' } },
  };

  const unhealthy: HealthReport = {
    ...healthy,
    status: 'error',
    checks: { database: { status: 'down' } },
  };

  const mockService = {
    check: jest.fn<() => Promise<HealthReport>>(),
  };

  beforeEach(async () => {
    mockService.check.mockReset();
    response = { status: jest.fn().mockReturnThis() } as unknown as Response;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [{ provide: HealthService, useValue: mockService }],
    }).compile();

    controller = module.get<HealthController>(HealthController);
    service = module.get<HealthService>(HealthService);
  });

  it('wraps the report the service produced in a data envelope', async () => {
    mockService.check.mockResolvedValue(healthy);

    const result = await controller.check(response);

    expect(service.check).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ data: healthy });
  });

  it('responds 200 when the service reports ok', async () => {
    mockService.check.mockResolvedValue(healthy);

    await controller.check(response);

    expect(response.status).toHaveBeenCalledWith(HttpStatus.OK);
  });

  it('responds 503 when the service reports an error', async () => {
    mockService.check.mockResolvedValue(unhealthy);

    await controller.check(response);

    expect(response.status).toHaveBeenCalledWith(
      HttpStatus.SERVICE_UNAVAILABLE,
    );
  });
});
