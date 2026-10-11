import { jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import {
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { OAuth2Client } from 'google-auth-library';
import { GoogleOAuthService } from './google-oauth.service';

describe('GoogleOAuthService', () => {
  let service: GoogleOAuthService;
  let configService: ConfigService;

  const validClientIds =
    'client-id-1.apps.googleusercontent.com, client-id-2.apps.googleusercontent.com';

  const mockConfigService = {
    get: jest.fn((key: string) => {
      if (key === 'GOOGLE_CLIENT_IDS') return validClientIds;
      return null;
    }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GoogleOAuthService,
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<GoogleOAuthService>(GoogleOAuthService);
    configService = module.get<ConfigService>(ConfigService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('verifyIdToken', () => {
    it('should throw InternalServerErrorException if GOOGLE_CLIENT_IDS is not configured', async () => {
      jest.spyOn(configService, 'get').mockReturnValueOnce(undefined);

      await expect(service.verifyIdToken('some-token')).rejects.toThrow(
        InternalServerErrorException,
      );
    });

    it('should throw UnauthorizedException if email is not verified', async () => {
      jest
        .spyOn(OAuth2Client.prototype, 'verifyIdToken')
        .mockResolvedValueOnce({
          getPayload: () => ({
            sub: 'google-sub-123',
            email: 'test@example.com',
            email_verified: false,
            name: 'Ada Obi',
            picture: 'https://example.com/pic.jpg',
          }),
        } as unknown as Awaited<ReturnType<OAuth2Client['verifyIdToken']>>);

      await expect(service.verifyIdToken('valid-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException if payload is missing sub or email', async () => {
      jest
        .spyOn(OAuth2Client.prototype, 'verifyIdToken')
        .mockResolvedValueOnce({
          getPayload: () => ({
            sub: '',
            email: 'test@example.com',
            email_verified: true,
          }),
        } as unknown as Awaited<ReturnType<OAuth2Client['verifyIdToken']>>);

      await expect(service.verifyIdToken('valid-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should return GoogleProfile when token is valid and email is verified', async () => {
      const verifySpy = jest
        .spyOn(OAuth2Client.prototype, 'verifyIdToken')
        .mockResolvedValueOnce({
          getPayload: () => ({
            sub: 'google-sub-123',
            email: 'test@example.com',
            email_verified: true,
            name: 'Ada Obi',
            picture: 'https://example.com/pic.jpg',
          }),
        } as unknown as Awaited<ReturnType<OAuth2Client['verifyIdToken']>>);

      const result = await service.verifyIdToken('valid-token');

      expect(result).toEqual({
        googleId: 'google-sub-123',
        email: 'test@example.com',
        emailVerified: true,
        fullName: 'Ada Obi',
        picture: 'https://example.com/pic.jpg',
      });

      expect(verifySpy).toHaveBeenCalledWith({
        idToken: 'valid-token',
        audience: [
          'client-id-1.apps.googleusercontent.com',
          'client-id-2.apps.googleusercontent.com',
        ],
      });
    });
  });
});
