import { jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { ReferenceController } from './reference.controller';
import { ReferenceService } from './reference.service';
import { ReferenceOptionsDto } from './dto/reference-options.dto';

describe('ReferenceController', () => {
  let controller: ReferenceController;

  const mockReferenceService = {
    getOnboardingOptions: jest.fn<() => Promise<ReferenceOptionsDto>>(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ReferenceController],
      providers: [
        { provide: ReferenceService, useValue: mockReferenceService },
      ],
    }).compile();

    controller = module.get<ReferenceController>(ReferenceController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getOptions', () => {
    it('should delegate to referenceService.getOnboardingOptions', async () => {
      const mockResult: ReferenceOptionsDto = {
        educationLevels: [{ value: 'BACHELOR', label: "Bachelor's degree" }],
        internshipOptions: [{ value: 'NONE', label: 'None' }],
        experienceOptions: [{ value: 'THREE_PLUS', label: '3+ years' }],
        skills: [{ id: 's1', name: 'TypeScript', description: null }],
        fields: [{ id: 'f1', name: 'Software', slug: 'software' }],
      };

      mockReferenceService.getOnboardingOptions.mockResolvedValue(mockResult);

      const result = await controller.getOptions();

      expect(mockReferenceService.getOnboardingOptions).toHaveBeenCalledTimes(
        1,
      );
      expect(result).toEqual(mockResult);
    });
  });
});
