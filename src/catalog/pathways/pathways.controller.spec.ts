import { Test, TestingModule } from '@nestjs/testing';
import { PathwaysController } from './pathways.controller';
import { PathwaysService } from './pathways.service';

describe('PathwaysController', () => {
  let controller: PathwaysController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PathwaysController],
      providers: [PathwaysService],
    }).compile();

    controller = module.get<PathwaysController>(PathwaysController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
