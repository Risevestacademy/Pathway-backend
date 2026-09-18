import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma';

export type HealthIndicatorStatus = 'up' | 'down';

export interface HealthReport {
  status: 'ok' | 'error';
  uptime: number;
  timestamp: string;
  checks: {
    database: { status: HealthIndicatorStatus };
  };
}

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(private readonly prisma: PrismaService) {}

  async check(): Promise<HealthReport> {
    const database = await this.checkDatabase();

    return {
      status: database === 'up' ? 'ok' : 'error',
      uptime: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
      checks: {
        database: { status: database },
      },
    };
  }

  private async checkDatabase(): Promise<HealthIndicatorStatus> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return 'up';
    } catch (error) {
      this.logger.error(
        'Database health check failed',
        error instanceof Error ? error.stack : String(error),
      );
      return 'down';
    }
  }
}
