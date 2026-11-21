import { Controller } from '@nestjs/common';
import { RevisionsService } from './revisions.service';

@Controller('revisions')
export class RevisionsController {
  constructor(private readonly revisionsService: RevisionsService) {}
}
