// src/careers/careers.service.ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { GetCareersQueryDto } from './dto/get-careers-query.dto';
import { CareerListItemDto } from './dto/list-careers.dto';
import { CareerStatus } from '../../generated/prisma/client';

@Injectable()
export class CareersService {
  constructor(private readonly prisma: PrismaService) {}

  async getPublicCareers(
    query: GetCareersQueryDto,
  ): Promise<CareerListItemDto[]> {
    const { level, interest } = query;

    const where = {
      status: CareerStatus.PUBLISHED,
      ...(level && { targetLevels: { has: level } }),
      ...(interest && { field: { slug: interest } }),
    };

    const careers = await this.prisma.career.findMany({
      where,
      select: {
        id: true,
        slug: true,
        title: true,
        description: true,
      },
      orderBy: {
        title: 'asc',
      },
    });

    return careers.map((career) => ({
      id: career.id,
      slug: career.slug,
      title: career.title,
      shortDescription: career.description,
    }));
  }
}
