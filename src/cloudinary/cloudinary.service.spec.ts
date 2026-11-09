import { jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { CloudinaryService } from './cloudinary.service';

describe('CloudinaryService', () => {
  let service: CloudinaryService;

  // Mock the ConfigService to return dummy values for the tests
  const mockConfigService = {
    get: jest.fn((key: string) => {
      switch (key) {
        case 'CLOUDINARY_CLOUD_NAME':
          return 'test-cloud';
        case 'CLOUDINARY_API_KEY':
          return 'test-key';
        case 'CLOUDINARY_API_SECRET':
          return 'test-secret';
        case 'CLOUDINARY_AVATAR_PRESET':
          return 'avatar_preset';
        default:
          return null;
      }
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CloudinaryService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<CloudinaryService>(CloudinaryService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should generate a signature', () => {
    const result = service.generateAvatarSignature('user-123');

    expect(result).toHaveProperty('signature');
    expect(result.folder).toBe('avatars/user-123');
    expect(result.uploadPreset).toBe('avatar_preset');
  });
});
