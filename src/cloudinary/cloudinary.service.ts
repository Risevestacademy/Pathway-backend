import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary } from 'cloudinary';
import { EnvironmentVariables } from '../config';

@Injectable()
export class CloudinaryService {
  constructor(
    private readonly configService: ConfigService<EnvironmentVariables, true>,
  ) {
    cloudinary.config({
      cloud_name: this.configService.get('CLOUDINARY_CLOUD_NAME'),
      api_key: this.configService.get('CLOUDINARY_API_KEY'),
      api_secret: this.configService.get('CLOUDINARY_API_SECRET'),
    });
  }

  generateAvatarSignature(userId: string) {
    const timestamp = Math.round(new Date().getTime() / 1000);
    const folder = `avatars/${userId}`;
    const uploadPreset = this.configService.get('CLOUDINARY_AVATAR_PRESET');

    const signature = cloudinary.utils.api_sign_request(
      { folder, timestamp, upload_preset: uploadPreset },
      this.configService.get('CLOUDINARY_API_SECRET'),
    );

    return {
      cloudName: this.configService.get('CLOUDINARY_CLOUD_NAME'),
      apiKey: this.configService.get('CLOUDINARY_API_KEY'),
      timestamp,
      signature,
      folder,
      uploadPreset,
    };
  }
}
