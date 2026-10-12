import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma';
import { CareerStatus } from '../../generated/prisma/client';
import { PathwayMetadataDto } from './dto/pathway-metadata.dto';

@Injectable()
export class PathwayService {
  constructor(private readonly prisma: PrismaService) {}

  async getPathwayMetadata(pathwayId: string): Promise<PathwayMetadataDto> {
    const pathway = await this.prisma.pathway.findFirst({
      where: {
        id: pathwayId,
        career: { status: CareerStatus.PUBLISHED },
      },
      select: {
        id: true,
        careerId: true,
        title: true,
        description: true,
        _count: { select: { steps: true } },
        steps: {
          orderBy: { order: 'asc' },
          select: { id: true, title: true, order: true, description: true },
        },
      },
    });

    if (!pathway) {
      throw new NotFoundException('Pathway not found');
    }

    return {
      id: '...',
      careerId: '...',
      title: '...',
      description: '...',
      stepCount: 5,
      steps: [{ id: '...', title: '...', order: 1, description: '...' }],
    };
  }
}
