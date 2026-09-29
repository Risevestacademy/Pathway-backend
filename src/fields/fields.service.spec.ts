import { jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { FieldsService } from './fields.service';
import { PrismaService } from '../prisma';
import { FieldListItemDto } from './dto/list-fields.dto';

describe('FieldsService', () => {
  let service: FieldsService;

  const mockPrismaService = {
    field: {
      findMany: jest.fn<(args: unknown) => Promise<FieldListItemDto[]>>(),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FieldsService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<FieldsService>(FieldsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getFields', () => {
    const mockDbFields: FieldListItemDto[] = [
      {
        id: 'field-data',
        name: 'Data & Analytics',
        slug: 'data-analytics',
      },
      {
        id: 'field-software',
        name: 'Software Engineering',
        slug: 'software-engineering',
      },
    ];

    it('should return every field with only its id, name and slug', async () => {
      mockPrismaService.field.findMany.mockResolvedValue(mockDbFields);

      const result = await service.getFields();

      expect(result).toEqual(mockDbFields);
    });

    it('should query all fields sorted by name, selecting only id, name and slug', async () => {
      mockPrismaService.field.findMany.mockResolvedValue(mockDbFields);

      await service.getFields();

      expect(mockPrismaService.field.findMany).toHaveBeenCalledTimes(1);
      expect(mockPrismaService.field.findMany).toHaveBeenCalledWith({
        select: {
          id: true,
          name: true,
          slug: true,
        },
        orderBy: {
          name: 'asc',
        },
      });
    });

    it('should return an empty array when there are no fields', async () => {
      mockPrismaService.field.findMany.mockResolvedValue([]);

      const result = await service.getFields();

      expect(result).toEqual([]);
    });
  });
});
