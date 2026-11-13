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
import type { AdminFeedbackDetailDto } from './dto/admin-feedback-detail.dto';
import {
  FEEDBACK_DETAIL_SELECT,
  FEEDBACK_NOTE_SELECT,
  toAdminFeedbackDetail,
} from './feedback-detail';
import {
  buildFeedbackListWhere,
  FEEDBACK_LIST_SELECT,
  type FeedbackListRow,
  targetKey,
  toAdminFeedbackListItem,
} from './feedback-list';
import {
  type FeedbackUpdateFailure,
  type FeedbackUpdateInput,
  resolveFeedbackTarget,
  resolveStatusUpdate,
} from './feedback.rules';

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

type LabelledTargetType = Exclude<FeedbackTargetType, 'OTHER'>;

interface TargetLabel {
  id: string;
  label: string;
}

const byTitle = (rows: { id: string; title: string }[]): TargetLabel[] =>
  rows.map(({ id, title }) => ({ id, label: title }));

@Injectable()
export class FeedbackService {
  private readonly logger = new Logger(FeedbackService.name);

  constructor(private readonly prisma: PrismaService) {}

  async submitFeedback(
    dto: CreateFeedbackDto,
  ): Promise<CreateFeedbackResponseDto> {
    const { targetType, targetId } = resolveFeedbackTarget(dto);
    await this.assertTargetVisible(targetType, targetId);

    let created: { id: string };
    try {
      created = await this.prisma.contentFeedback.create({
        data: {
          category: dto.category,
          description: dto.description,
          section: dto.section,
          careerId: dto.careerId,
          userEmail: dto.userEmail,
          platform: dto.platform,
          targetType,
          targetId,
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
      { feedbackId: created.id, targetType },
      'Feedback submitted',
    );

    return { message: 'Feedback received' };
  }

  async getFeedback(
    query: GetFeedbackQueryDto,
  ): Promise<FeedbackListResponseDto> {
    const { page, limit } = query;
    const where = buildFeedbackListWhere(query);

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.contentFeedback.findMany({
        where,
        select: FEEDBACK_LIST_SELECT,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.contentFeedback.count({ where }),
    ]);

    const labels = await this.loadTargetLabels(rows);

    return {
      items: rows.map((row) =>
        toAdminFeedbackListItem(
          row,
          row.targetType && row.targetId
            ? (labels.get(targetKey(row.targetType, row.targetId)) ?? null)
            : null,
        ),
      ),
      total,
      page,
      limit,
    };
  }

  async getFeedbackDetail(id: string): Promise<AdminFeedbackDetailDto> {
    const row = await this.prisma.contentFeedback.findUnique({
      where: { id },
      select: FEEDBACK_DETAIL_SELECT,
    });
    if (!row) throw new NotFoundException('Feedback not found');

    const labels = await this.loadTargetLabels([row]);

    return toAdminFeedbackDetail(
      row,
      row.targetType && row.targetId
        ? (labels.get(targetKey(row.targetType, row.targetId)) ?? null)
        : null,
    );
  }

  /** Status and resolution change together, then the admin detail is read. */
  async triageFeedback(
    id: string,
    actorId: string,
    input: FeedbackUpdateInput,
  ): Promise<AdminFeedbackDetailDto> {
    await this.updateFeedback(id, actorId, input);
    return this.getFeedbackDetail(id);
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

  // Reports keep no foreign key to their target, so labels are looked up per
  // type for the whole page: one query per type that appears, never per row.
  private async loadTargetLabels(
    rows: FeedbackListRow[],
  ): Promise<Map<string, string>> {
    const idsByType = new Map<LabelledTargetType, Set<string>>();
    for (const { targetType, targetId } of rows) {
      if (!targetType || !targetId || targetType === FeedbackTargetType.OTHER) {
        continue;
      }
      const ids = idsByType.get(targetType) ?? new Set<string>();
      ids.add(targetId);
      idsByType.set(targetType, ids);
    }

    const labels = new Map<string, string>();
    await Promise.all(
      [...idsByType].map(async ([type, ids]) => {
        for (const { id, label } of await this.findTargetLabels(type, [
          ...ids,
        ])) {
          labels.set(targetKey(type, id), label);
        }
      }),
    );

    return labels;
  }

  private async findTargetLabels(
    targetType: LabelledTargetType,
    ids: string[],
  ): Promise<TargetLabel[]> {
    const where = { id: { in: ids } };
    const title = { id: true, title: true };

    switch (targetType) {
      case FeedbackTargetType.CAREER:
        return byTitle(
          await this.prisma.career.findMany({ where, select: title }),
        );
      case FeedbackTargetType.PATHWAY:
        return byTitle(
          await this.prisma.pathway.findMany({ where, select: title }),
        );
      case FeedbackTargetType.PATHWAY_STAGE:
        return byTitle(
          await this.prisma.pathwayStage.findMany({ where, select: title }),
        );
      case FeedbackTargetType.PATHWAY_STEP:
        return byTitle(
          await this.prisma.pathwayStep.findMany({ where, select: title }),
        );
      case FeedbackTargetType.TASK:
        return byTitle(
          await this.prisma.pathwayStepTask.findMany({ where, select: title }),
        );
      case FeedbackTargetType.RESOURCE:
      case FeedbackTargetType.CERTIFICATION:
        return byTitle(
          await this.prisma.resource.findMany({ where, select: title }),
        );
      case FeedbackTargetType.OUTLOOK: {
        const outlook = await this.prisma.outlookData.findMany({
          where,
          select: { id: true, geography: true, period: true },
        });
        return outlook.map(({ id, geography, period }) => ({
          id,
          label: `${geography} (${period})`,
        }));
      }
    }
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
