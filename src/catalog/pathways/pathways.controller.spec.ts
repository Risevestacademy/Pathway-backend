import { jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { PathwaysController } from './pathways.controller';
import { PathwaysService } from './pathways.service';
import { PathwayMetadataDto } from './dto/pathway-metadata.dto';

describe('PathwaysController', () => {
  let controller: PathwaysController;

  const mockPathwaysService = {
    getPathwayMetadata:
      jest.fn<(pathwayId: string) => Promise<PathwayMetadataDto>>(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PathwaysController],
      providers: [
        {
          provide: PathwaysService,
          useValue: mockPathwaysService,
        },
      ],
    }).compile();

    controller = module.get<PathwaysController>(PathwaysController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getPathwayMetadata', () => {
    it('should delegate the pathway id to pathwaysService.getPathwayMetadata', async () => {
      const mockResult: PathwayMetadataDto = {
        id: 'pathway-1',
        careerId: 'career-1',
        title: 'Frontend Engineer Pathway',
        description: 'A path to frontend engineering.',
        stepCount: 2,
        steps: [
          { id: 'step-1', title: 'HTML basics', order: 1, description: null },
          {
            id: 'step-2',
            title: 'CSS layout',
            order: 2,
            description: 'Flex and grid.',
          },
        ],
      };

      mockPathwaysService.getPathwayMetadata.mockResolvedValue(mockResult);

      const result = await controller.getPathwayMetadata('pathway-1');

      expect(mockPathwaysService.getPathwayMetadata).toHaveBeenCalledTimes(1);
      expect(mockPathwaysService.getPathwayMetadata).toHaveBeenCalledWith(
        'pathway-1',
      );
      expect(result).toEqual(mockResult);
    });

    it('returns pathway metadata with slim steps only (no resources or skills)', async () => {
      const mockResult: PathwayMetadataDto = {
        id: 'pathway-1',
        careerId: 'career-1',
        title: 'Frontend Engineer Pathway',
        description: null,
        stepCount: 1,
        steps: [
          { id: 'step-1', title: 'HTML basics', order: 1, description: null },
        ],
      };

      mockPathwaysService.getPathwayMetadata.mockResolvedValue(mockResult);

      const result = await controller.getPathwayMetadata('pathway-1');

      expect(Object.keys(result).sort()).toEqual(
        ['careerId', 'description', 'id', 'stepCount', 'steps', 'title'].sort(),
      );
      expect(Object.keys(result.steps[0]).sort()).toEqual(
        ['description', 'id', 'order', 'title'].sort(),
      );
    });
  });
});
