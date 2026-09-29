import { jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { FieldsController } from './fields.controller';
import { FieldsService } from './fields.service';
import { FieldListItemDto } from './dto/list-fields.dto';

describe('FieldsController', () => {
  let controller: FieldsController;

  const mockFieldsService = {
    getFields: jest.fn<() => Promise<FieldListItemDto[]>>(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [FieldsController],
      providers: [
        {
          provide: FieldsService,
          useValue: mockFieldsService,
        },
      ],
    }).compile();

    controller = module.get<FieldsController>(FieldsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getFields', () => {
    it('should return the fields from fieldsService.getFields', async () => {
      const mockResult: FieldListItemDto[] = [
        {
          id: 'field-1',
          name: 'Software Engineering',
          slug: 'software-engineering',
        },
      ];

      mockFieldsService.getFields.mockResolvedValue(mockResult);

      const result = await controller.getFields();

      expect(mockFieldsService.getFields).toHaveBeenCalledTimes(1);
      expect(result).toEqual(mockResult);
    });
  });
});
