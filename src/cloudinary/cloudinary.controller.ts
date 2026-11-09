import { Controller, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { type AuthenticatedUser, CurrentUser, JwtAuthGuard } from '../common';
import { CloudinaryService } from './cloudinary.service';
import { AvatarSignatureResponseDto } from './dto/avatar-signature-response.dto';

@ApiTags('Media')
@ApiBearerAuth()
@Controller('media')
@UseGuards(JwtAuthGuard)
export class CloudinaryController {
  constructor(private readonly cloudinaryService: CloudinaryService) {}

  @ApiOperation({
    summary: 'Get a signature to upload an avatar to Cloudinary',
  })
  @ApiResponse({
    status: 201,
    description:
      'Returns the credentials needed to upload directly to Cloudinary.',
    type: AvatarSignatureResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Access token missing or invalid' })
  @Post('avatar/signature')
  async getAvatarSignature(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<AvatarSignatureResponseDto> {
    return this.cloudinaryService.generateAvatarSignature(user.id);
  }
}
