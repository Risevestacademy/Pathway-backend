import { Test, TestingModule } from '@nestjs/testing';
import { PathwayController } from './pathway.controller';
import { PathwayService } from './pathway.service';

describe('PathwayController', () => {
  let controller: PathwayController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PathwayController],
      providers: [PathwayService],
    }).compile();

    controller = module.get<PathwayController>(PathwayController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
