import { Controller } from '@nestjs/common';
import { PublishingService } from './publishing.service';

@Controller('publishing')
export class PublishingController {
  constructor(private readonly publishingService: PublishingService) {}
}
