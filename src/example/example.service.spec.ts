import { Test, TestingModule } from '@nestjs/testing';
import { ExampleService } from './example.service';
// import { PrismaService } from '../prisma/prisma.service';

describe('ExampleService', () => {
  let service: ExampleService;
  // let prisma: PrismaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExampleService,
        // {
        //   provide: PrismaService,
        //   useValue: {
        //     example: {
        //       findMany: jest.fn(),
        //       findUnique: jest.fn(),
        //       create: jest.fn(),
        //       update: jest.fn(),
        //       delete: jest.fn(),
        //     },
        //   },
        // },
      ],
    }).compile();

    service = module.get<ExampleService>(ExampleService);
    // prisma = module.get<PrismaService>(PrismaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // Replace with real cases once Prisma calls are implemented:
  //
  // describe('findById', () => {
  //   it('returns the record when found', async () => {
  //     const record = { id: '1', name: 'Test' };
  //     jest.spyOn(prisma.example, 'findUnique').mockResolvedValue(record);
  //     await expect(service.findById('1')).resolves.toEqual(record);
  //   });
  //
  //   it('throws NotFoundException when missing', async () => {
  //     jest.spyOn(prisma.example, 'findUnique').mockResolvedValue(null);
  //     await expect(service.findById('missing')).rejects.toThrow();
  //   });
  // });
});
