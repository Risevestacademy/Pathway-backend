-- Drop the old "one open revision per career" partial unique index.
--
-- Under the session-centric design, a session can contain multiple
-- ContentRevisions that share a careerId — a CAREER revision, a PATHWAY_STEP
-- revision, a RESOURCE revision, all carry the same career context (README
-- §Concepts). The old index enforced "at most one open revision per career",
-- which was correct for the career-centric revision model and is
-- incompatible with the new design.
--
-- Superseded by:
--   * @@unique([sessionId, contentType, contentId])  — one pending change
--     per model per session.
--   * createSession's FOR UPDATE on the Career row — serialises concurrent
--     session opens for the same context.
--   * The session lifecycle (one DRAFT session per context per editor).

DROP INDEX IF EXISTS "ContentRevision_careerId_open_key";