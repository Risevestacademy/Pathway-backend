import { Injectable } from '@nestjs/common';

/**
 * The generic revision service. Implements session lifecycle, batch save,
 * submit, review, and the publish orchestrator, driven by the strategy
 * registry.
 *
 * See `src/revisions/README.md` for the workflow, and
 * `src/revisions/ARCHITECTURE.md` for the decisions behind it.
 */
@Injectable()
export class PublishingService {}
