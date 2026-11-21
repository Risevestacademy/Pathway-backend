import { Test, TestingModule } from '@nestjs/testing';
import { RevisionsController } from './revisions.controller';
import { RevisionsService } from './revisions.service';

describe('RevisionsController', () => {
  let controller: RevisionsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [RevisionsController],
      providers: [RevisionsService],
    }).compile();

    controller = module.get<RevisionsController>(RevisionsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
