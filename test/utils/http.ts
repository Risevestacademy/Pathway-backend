import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type Test from 'supertest/lib/test';

/**
 * Thin HTTP wrappers for the sessions endpoints. Each returns a supertest
 * `Test` — the chainable object — so callers can `.expect(status)` before
 * awaiting. (Returning `Promise<Response>` would strip `.expect` because
 * `Response` is a plain value, not the chainable agent.)
 *
 * These are pure scaffolding — no assertions, no retries, no fudging. The
 * spec is the source of truth for what each call means.
 */

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

export function createSessionApi(
  app: INestApplication,
  apiPrefix: string,
  token: string,
  body: object,
): Test {
  return request(app.getHttpServer())
    .post(`${apiPrefix}/admin/sessions`)
    .set(auth(token))
    .send(body);
}

export function findOpenSessionApi(
  app: INestApplication,
  apiPrefix: string,
  token: string,
  query: { contextType: string; contextId: string },
): Test {
  return request(app.getHttpServer())
    .get(`${apiPrefix}/admin/sessions`)
    .query(query)
    .set(auth(token));
}

export function getSessionApi(
  app: INestApplication,
  apiPrefix: string,
  token: string,
  sessionId: string,
): Test {
  return request(app.getHttpServer())
    .get(`${apiPrefix}/admin/sessions/${sessionId}`)
    .set(auth(token));
}

export function saveDraftApi(
  app: INestApplication,
  apiPrefix: string,
  token: string,
  sessionId: string,
  body: { changes: object[] },
): Test {
  return request(app.getHttpServer())
    .post(`${apiPrefix}/admin/sessions/${sessionId}/draft`)
    .set(auth(token))
    .send(body);
}

export function submitApi(
  app: INestApplication,
  apiPrefix: string,
  token: string,
  sessionId: string,
): Test {
  return request(app.getHttpServer())
    .post(`${apiPrefix}/admin/sessions/${sessionId}/submit`)
    .set(auth(token));
}

export function getDiffApi(
  app: INestApplication,
  apiPrefix: string,
  token: string,
  sessionId: string,
): Test {
  return request(app.getHttpServer())
    .get(`${apiPrefix}/admin/sessions/${sessionId}/diff`)
    .set(auth(token));
}

export function getSnapshotsApi(
  app: INestApplication,
  apiPrefix: string,
  token: string,
  sessionId: string,
): Test {
  return request(app.getHttpServer())
    .get(`${apiPrefix}/admin/sessions/${sessionId}/snapshots`)
    .set(auth(token));
}

export function reviewApi(
  app: INestApplication,
  apiPrefix: string,
  token: string,
  sessionId: string,
  body: { decision: string; note?: string },
): Test {
  return request(app.getHttpServer())
    .post(`${apiPrefix}/admin/sessions/${sessionId}/review`)
    .set(auth(token))
    .send(body);
}

export function publishApi(
  app: INestApplication,
  apiPrefix: string,
  token: string,
  sessionId: string,
): Test {
  return request(app.getHttpServer())
    .post(`${apiPrefix}/admin/sessions/${sessionId}/publish`)
    .set(auth(token));
}

export function discardApi(
  app: INestApplication,
  apiPrefix: string,
  token: string,
  sessionId: string,
): Test {
  return request(app.getHttpServer())
    .delete(`${apiPrefix}/admin/sessions/${sessionId}`)
    .set(auth(token));
}

export function rebaseApi(
  app: INestApplication,
  apiPrefix: string,
  token: string,
  sessionId: string,
): Test {
  return request(app.getHttpServer())
    .post(`${apiPrefix}/admin/sessions/${sessionId}/rebase`)
    .set(auth(token));
}
