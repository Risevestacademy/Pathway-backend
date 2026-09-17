import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ExampleService } from './example.service';
import { CreateExampleDto } from './dto/create-example.dto';
import { UpdateExampleDto } from './dto/update-example.dto';

/**
 * ExampleController — HTTP layer only.
 *
 * No business logic here. No direct Prisma calls here. Every method
 * should read as: take the request, call the service, return the result.
 * If you find yourself writing an if-statement that isn't about the
 * HTTP layer (status codes, param parsing), it probably belongs in
 * the service instead.
 */
@Controller('examples')
export class ExampleController {
  constructor(private readonly exampleService: ExampleService) {}

  @Get()
  findAll() {
    return this.exampleService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.exampleService.findById(id);
  }

  @Post()
  create(@Body() dto: CreateExampleDto) {
    return this.exampleService.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateExampleDto) {
    return this.exampleService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.exampleService.remove(id);
  }
}
