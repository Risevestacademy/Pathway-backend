import { Test, TestingModule } from '@nestjs/testing';
import { ExampleController } from './example.controller';
import { ExampleService } from './example.service';

// Controller tests are deliberately light — just confirming the
// controller routes to the right service method with the right args
// and returns whatever the service gives back. Business logic,
// not-found handling, etc. belong in example.service.spec.ts instead.
describe('ExampleController', () => {
  let controller: ExampleController;
  let service: ExampleService;

  const mockService = {
    findAll: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ExampleController],
      providers: [{ provide: ExampleService, useValue: mockService }],
    }).compile();

    controller = module.get<ExampleController>(ExampleController);
    service = module.get<ExampleService>(ExampleService);
  });

  it('findOne calls service.findById with the given id', async () => {
    const record = { id: '123', name: 'Test' };
    mockService.findById.mockResolvedValue(record);

    const result = await controller.findOne('123');

    expect(service.findById).toHaveBeenCalledWith('123');
    expect(result).toEqual(record);
  });
});
