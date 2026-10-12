import { Test, TestingModule } from '@nestjs/testing';
import { PathwaysService } from './pathways.service';

describe('PathwaysService', () => {
  let service: PathwaysService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PathwaysService],
    }).compile();

    service = module.get<PathwaysService>(PathwaysService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
