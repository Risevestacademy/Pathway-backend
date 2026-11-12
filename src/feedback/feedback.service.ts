import {
  BadRequestException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  CareerStatus,
  FeedbackTargetType,
  Prisma,
  ResourceStatus,
  ResourceType,
} from '../generated/prisma/client';
import { DomainException } from '../common';
import { PrismaService } from '../prisma';
import { CreateFeedbackDto } from './dto/create-feedback.dto';
import { CreateFeedbackResponseDto } from './dto/create-feedback-response.dto';
import { GetFeedbackQueryDto } from './dto/get-feedback-query.dto';
import { UpdateFeedbackStatusDto } from './dto/update-feedback-status.dto';
import { FeedbackResponseDto } from './dto/feedback-response.dto';
import { FeedbackListResponseDto } from './dto/feedback-list-response.dto';
import { FeedbackNoteDto } from './dto/feedback-note.dto';
import {
  type FeedbackUpdateFailure,
  type FeedbackUpdateInput,
  resolveStatusUpdate,
} from './feedback.rules';

const FEEDBACK_NOTE_SELECT = {
  id: true,
  feedbackId: true,
  authorId: true,
  body: true,
  createdAt: true,
} satisfies Prisma.FeedbackNoteSelect;

const STATUS_CHANGE_SELECT = {
  id: true,
  status: true,
  resolution: true,
  updatedAt: true,
} satisfies Prisma.ContentFeedbackSelect;

export type FeedbackStatusChange = Prisma.ContentFeedbackGetPayload<{
  select: typeof STATUS_CHANGE_SELECT;
}>;

const UPDATE_FAILURE_MESSAGES: Record<FeedbackUpdateFailure, string> = {
  RESOLUTION_REQUIRED: 'A resolution is required to resolve feedback',
  RESOLUTION_NOT_ALLOWED:
    'A resolution can only be set when the status is RESOLVED',
};

const PUBLISHED_CAREER = { status: CareerStatus.PUBLISHED };

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

  /**
   * The thing a report points at must exist and be visible to the public.
   * OTHER points at nothing, so it needs no targetId. A missing target is a
   * 404, the same as for an unknown id.
   */
  async assertTargetVisible(
    targetType: FeedbackTargetType,
    targetId?: string | null,
  ): Promise<void> {
    if (targetType === FeedbackTargetType.OTHER) return;

    if (!targetId) {
      this.logger.warn(
        { targetType, reason: 'TARGET_ID_REQUIRED' },
        'Feedback rejected',
      );
      throw new DomainException(
        HttpStatus.BAD_REQUEST,
        'TARGET_ID_REQUIRED',
        'targetId is required for this target type',
      );
    }

    if (!(await this.isTargetVisible(targetType, targetId))) {
      this.logger.warn(
        { targetType, targetId, reason: 'TARGET_NOT_FOUND' },
        'Feedback rejected',
      );
      throw new NotFoundException('Target not found');
    }
  }

  async updateFeedback(
    id: string,
    actorId: string,
    input: FeedbackUpdateInput,
  ): Promise<FeedbackStatusChange> {
    const outcome = resolveStatusUpdate(input);
    if (!outcome.ok) {
      this.logger.warn(
        { feedbackId: id, actorId, reason: outcome.code },
        'Feedback update rejected',
      );
      throw new DomainException(
        HttpStatus.BAD_REQUEST,
        outcome.code,
        UPDATE_FAILURE_MESSAGES[outcome.code],
      );
    }

    let updated: FeedbackStatusChange;
    try {
      updated = await this.prisma.contentFeedback.update({
        where: { id },
        data: { status: outcome.status, resolution: outcome.resolution },
        select: STATUS_CHANGE_SELECT,
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

    this.logger.log(
      {
        feedbackId: id,
        actorId,
        status: updated.status,
        resolution: updated.resolution,
      },
      'Feedback status changed',
    );

    return updated;
  }

  async addNote(
    feedbackId: string,
    actorId: string,
    body: string,
  ): Promise<FeedbackNoteDto> {
    let note: FeedbackNoteDto;
    try {
      note = await this.prisma.feedbackNote.create({
        data: { feedbackId, authorId: actorId, body },
        select: FEEDBACK_NOTE_SELECT,
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2003'
      ) {
        throw new NotFoundException('Feedback not found');
      }
      throw error;
    }

    this.logger.log({ feedbackId, actorId }, 'Feedback note added');

    return note;
  }

  private async isTargetVisible(
    targetType: Exclude<FeedbackTargetType, 'OTHER'>,
    id: string,
  ): Promise<boolean> {
    const select = { id: true };

    switch (targetType) {
      case FeedbackTargetType.CAREER:
        return (
          (await this.prisma.career.findFirst({
            where: { id, ...PUBLISHED_CAREER },
            select,
          })) !== null
        );
      case FeedbackTargetType.PATHWAY:
        return (
          (await this.prisma.pathway.findFirst({
            where: { id, career: PUBLISHED_CAREER },
            select,
          })) !== null
        );
      case FeedbackTargetType.PATHWAY_STAGE:
        return (
          (await this.prisma.pathwayStage.findFirst({
            where: { id, pathway: { career: PUBLISHED_CAREER } },
            select,
          })) !== null
        );
      case FeedbackTargetType.PATHWAY_STEP:
        return (
          (await this.prisma.pathwayStep.findFirst({
            where: { id, pathway: { career: PUBLISHED_CAREER } },
            select,
          })) !== null
        );
      case FeedbackTargetType.TASK:
        return (
          (await this.prisma.pathwayStepTask.findFirst({
            where: { id, step: { pathway: { career: PUBLISHED_CAREER } } },
            select,
          })) !== null
        );
      case FeedbackTargetType.RESOURCE:
        return (
          (await this.prisma.resource.findFirst({
            where: { id, status: ResourceStatus.ACTIVE },
            select,
          })) !== null
        );
      case FeedbackTargetType.CERTIFICATION:
        return (
          (await this.prisma.resource.findFirst({
            where: {
              id,
              type: ResourceType.CERTIFICATION,
              status: ResourceStatus.ACTIVE,
            },
            select,
          })) !== null
        );
      case FeedbackTargetType.OUTLOOK:
        return (
          (await this.prisma.outlookData.findFirst({
            where: { id, career: PUBLISHED_CAREER },
            select,
          })) !== null
        );
    }
  }
}
