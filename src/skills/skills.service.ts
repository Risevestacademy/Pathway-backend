import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma';
import { SkillListItemDto } from './dto/list-skills.dto';

@Injectable()
export class SkillsService {
  constructor(private readonly prisma: PrismaService) {}

  async getSkills(): Promise<SkillListItemDto[]> {
    return this.prisma.skill.findMany({
      select: {
        id: true,
        name: true,
        description: true,
      },
      orderBy: {
        name: 'asc',
      },
    });
  }
}
