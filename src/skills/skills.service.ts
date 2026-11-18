import { HttpStatus, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma';
import { SkillListItemDto } from './dto/list-skills.dto';
import { UserSkillStatus } from '../generated/prisma/browser';
import { DomainException } from '../common';

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

  async updateMySkills(userId: string, skillIds: string[]): Promise<void> {
    // 1. Remove duplicates
    const uniqueIds = [...new Set(skillIds)];

    // 2. Validate all skills exist in the catalog
    const existing = await this.prisma.skill.findMany({
      where: { id: { in: uniqueIds } },
      select: { id: true },
    });
    const existingIds = new Set(existing.map((s) => s.id));
    const unknown = uniqueIds.filter((id) => !existingIds.has(id));

    if (unknown.length > 0) {
      throw new DomainException(
        HttpStatus.BAD_REQUEST,
        'UNKNOWN_SKILL',
        'One or more skill IDs do not exist in the catalog',
        { skillIds: unknown },
      );
    }

    // 3. Replace the user's set
    await this.prisma.$transaction(async (tx) => {
      // Delete rows not in the new list
      await tx.userSkill.deleteMany({
        where: {
          userId,
          skillId: { notIn: uniqueIds },
        },
      });

      // Upsert the rest
      for (const skillId of uniqueIds) {
        await tx.userSkill.upsert({
          where: { userId_skillId: { userId, skillId } },
          create: {
            userId,
            skillId,
            status: UserSkillStatus.NOT_SURE,
            rating: null,
          },
          update: {}, // No-op if it already exists
        });
      }
    });
  }
}
