import {
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OAuth2Client } from 'google-auth-library';

export interface GoogleProfile {
  googleId: string;
  email: string;
  emailVerified: boolean;
  fullName: string | null;
  picture: string | null;
}

@Injectable()
export class GoogleOAuthService {
  private readonly client = new OAuth2Client();

  constructor(private readonly configService: ConfigService) {}

  async verifyIdToken(idToken: string): Promise<GoogleProfile> {
    const clientIdsEnv = this.configService.get<string>('GOOGLE_CLIENT_IDS');

    const allowedAudiences = clientIdsEnv
      ? clientIdsEnv
          .split(',')
          .map((id) => id.trim())
          .filter(Boolean)
      : [];

    if (allowedAudiences.length === 0) {
      throw new InternalServerErrorException('Google OAuth is not configured');
    }

    let payload;

    try {
      const ticket = await this.client.verifyIdToken({
        idToken,
        audience: allowedAudiences,
      });

      payload = ticket.getPayload();
    } catch {
      // Do not expose verification details or log the submitted token.
      throw new UnauthorizedException('Invalid Google ID token');
    }

    if (!payload?.sub || !payload.email || payload.email_verified !== true) {
      throw new UnauthorizedException(
        'Google account must have a verified email',
      );
    }

    return {
      googleId: payload.sub,
      email: payload.email,
      emailVerified: true,
      fullName: payload.name ?? null,
      picture: payload.picture ?? null,
    };
  }
}
