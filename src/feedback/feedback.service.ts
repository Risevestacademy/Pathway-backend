import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma';
import { CreateFeedbackDto } from './dto/create-feedback.dto';
import { CreateFeedbackResponseDto } from './dto/create-feedback-response.dto';
import { GetFeedbackQueryDto } from './dto/get-feedback-query.dto';
import { UpdateFeedbackStatusDto } from './dto/update-feedback-status.dto';
import { FeedbackResponseDto } from './dto/feedback-response.dto';
import { FeedbackListResponseDto } from './dto/feedback-list-response.dto';

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

  async getFeedback({
    status,
    careerId,
    page,
    limit,
  }: GetFeedbackQueryDto): Promise<FeedbackListResponseDto> {
    const where: Prisma.ContentFeedbackWhereInput = { status, careerId };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.contentFeedback.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.contentFeedback.count({ where }),
    ]);

    return { items, total, page, limit };
  }

  async updateFeedbackStatus(
    id: string,
    { status }: UpdateFeedbackStatusDto,
  ): Promise<FeedbackResponseDto> {
    try {
      return await this.prisma.contentFeedback.update({
        where: { id },
        data: { status },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        throw new NotFoundException('Feedback not found');
      }
      throw error;
    }
  }
}
