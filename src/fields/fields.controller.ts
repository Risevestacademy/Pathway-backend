import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { FieldsService } from './fields.service';
import { FieldListItemDto } from './dto/list-fields.dto';

@ApiTags('Fields')
@Controller('fields')
export class FieldsController {
  constructor(private readonly fieldsService: FieldsService) {}

  @Get()
  @ApiOperation({ summary: 'Get all career fields' })
  @ApiResponse({
    status: 200,
    description:
      'All career fields sorted by name. Returns an empty array if there are none.',
    type: [FieldListItemDto],
  })
  async getFields(): Promise<FieldListItemDto[]> {
    return this.fieldsService.getFields();
  }
}
