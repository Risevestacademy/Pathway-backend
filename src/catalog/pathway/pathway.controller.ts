import { Controller } from '@nestjs/common';
import { PathwayService } from './pathway.service';

@Controller('pathway')
export class PathwayController {
  constructor(private readonly pathwayService: PathwayService) {}
}
