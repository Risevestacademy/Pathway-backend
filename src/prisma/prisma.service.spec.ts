import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from './prisma.service';

describe('PrismaService', () => {
  const connectionString =
    'postgresql://user:pass@localhost:5432/pathway?schema=public';

  let service: PrismaService;
  let get: jest.Mock;

  beforeEach(async () => {
    get = jest.fn().mockReturnValue(connectionString);

    const module: TestingModule = await Test.createTestingModule({
      providers: [PrismaService, { provide: ConfigService, useValue: { get } }],
    }).compile();

    service = module.get<PrismaService>(PrismaService);
  });

  it('builds its connection from DATABASE_URL', () => {
    expect(get).toHaveBeenCalledWith('DATABASE_URL', { infer: true });
  });

  it('connects and verifies the database is reachable on initialization', async () => {
    const connect = jest
      .spyOn(service, '$connect')
      .mockResolvedValue(undefined);
    const query = jest
      .spyOn(service, '$queryRaw')
      .mockResolvedValue([{ x: 1 }]);

    await service.onModuleInit();

    expect(connect).toHaveBeenCalledTimes(1);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('fails initialization when the database is unreachable', async () => {
    jest.spyOn(service, '$connect').mockResolvedValue(undefined);
    jest
      .spyOn(service, '$queryRaw')
      .mockRejectedValue(new Error('connection refused'));

    await expect(service.onModuleInit()).rejects.toThrow('connection refused');
  });

  it('disconnects on module destruction', async () => {
    const disconnect = jest
      .spyOn(service, '$disconnect')
      .mockResolvedValue(undefined);

    await service.onModuleDestroy();

    expect(disconnect).toHaveBeenCalledTimes(1);
  });
});
