import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ReferenceService } from './reference.service';
import { ReferenceOptionsDto } from './dto/reference-options.dto';

@ApiTags('Onboarding')
@Controller('onboarding')
export class ReferenceController {
  constructor(private readonly referenceService: ReferenceService) {}

  @Get('options')
  @ApiOperation({
    summary: 'Get all options for the second onboarding screen',
  })
  @ApiResponse({
    status: 200,
    description:
      'Education, internship, and experience options with labels, plus ' +
      'skills and fields.',
    type: ReferenceOptionsDto,
  })
  async getOptions(): Promise<ReferenceOptionsDto> {
    return this.referenceService.getOnboardingOptions();
  }
}
