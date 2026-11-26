import { RevisionSessionResponseDto } from './revision-session-response.dto';

/**
 * Result of POST /admin/sessions/:id/submit.
 *
 * Same shape as the base session response. Its own class so submit-only
 */
export class SubmitResponseDto extends RevisionSessionResponseDto {}
