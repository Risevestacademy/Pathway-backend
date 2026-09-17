import { Injectable, NotFoundException } from '@nestjs/common';
// import { PrismaService } from '../prisma/prisma.service';
import { CreateExampleDto } from './dto/create-example.dto';
import { UpdateExampleDto } from './dto/update-example.dto';

/**
 * ExampleService — this is the module's real public interface.
 *
 * Business logic and Prisma access live HERE, not in the controller.
 * Other modules that need something from this domain call this service
 * directly (imported via this module's index.ts) — they never reach
 * into this module's Prisma models themselves, and they never call
 * this module's controller.
 */
@Injectable()
export class ExampleService {
  // constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    // return this.prisma.example.findMany();
    throw new Error('Not implemented — replace with real Prisma call');
  }

  async findById(id: string) {
    // const record = await this.prisma.example.findUnique({ where: { id } });
    // if (!record) throw new NotFoundException('Example not found');
    // return record;
    throw new Error('Not implemented — replace with real Prisma call');
  }

  async create(dto: CreateExampleDto) {
    // return this.prisma.example.create({ data: dto });
    throw new Error('Not implemented — replace with real Prisma call');
  }

  async update(id: string, dto: UpdateExampleDto) {
    // await this.findById(id); // re-use existence check
    // return this.prisma.example.update({ where: { id }, data: dto });
    throw new Error('Not implemented — replace with real Prisma call');
  }

  async remove(id: string) {
    // await this.findById(id);
    // return this.prisma.example.delete({ where: { id } });
    throw new Error('Not implemented — replace with real Prisma call');
  }
}
