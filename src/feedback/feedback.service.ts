import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma';
import { CreateFeedbackDto } from './dto/create-feedback.dto';
import { CreateFeedbackResponseDto } from './dto/create-feedback-response.dto';

@Injectable()
export class FeedbackService {
  private readonly logger = new Logger(FeedbackService.name);

  constructor(private readonly prisma: PrismaService) {}

  async submitFeedback(
    dto: CreateFeedbackDto,
  ): Promise<CreateFeedbackResponseDto> {
    try {
      await this.prisma.contentFeedback.create({
        data: {
          category: dto.category,
          description: dto.description,
          section: dto.section,
          careerId: dto.careerId,
          userEmail: dto.userEmail,
          platform: dto.platform,
        },
        select: { id: true },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2003'
      ) {
        this.logger.warn(
          { careerId: dto.careerId, reason: 'CAREER_NOT_FOUND' },
          'Feedback rejected',
        );
        throw new BadRequestException('Career not found');
      }
      throw error;
    }

    this.logger.log(
      { category: dto.category, section: dto.section, careerId: dto.careerId },
      'Feedback submitted',
    );

    return { message: 'Feedback received' };
  }
}
