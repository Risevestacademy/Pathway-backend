import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma';
import { FieldListItemDto } from './dto/list-fields.dto';

@Injectable()
export class FieldsService {
  constructor(private readonly prisma: PrismaService) {}

  async getFields(): Promise<FieldListItemDto[]> {
    return this.prisma.field.findMany({
      select: {
        id: true,
        name: true,
        slug: true,
      },
      orderBy: {
        name: 'asc',
      },
    });
  }
}
