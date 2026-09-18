# Pathway — Backend

Pathway is a personalized career and skill-development platform. It tracks **validated skill acquisition** rather than step completion: a user's skill rating moves only when an assessment says it should.

This repository is the NestJS + PostgreSQL backend.

## Stack

| Layer          | Technology                                                 |
| -------------- | ---------------------------------------------------------- |
| Framework      | NestJS (TypeScript)                                        |
| Database & ORM | PostgreSQL + Prisma                                        |
| Validation     | Global `ValidationPipe` + `class-validator` DTOs           |
| Errors         | Global `HttpExceptionFilter` with a unified response shape |
| Tests          | Jest (unit + e2e)                                          |

## Getting started

Requires Node 24 and Docker.

```bash
cp .env.example .env
docker compose up -d
npm install
npm run db:migrate
npm run db:seed
npm run start:dev
```

The API listens on `PORT` (3000 by default). `GET /health` reports service and database status.

Database setup is covered in more detail in [doc/docker.md](doc/docker.md).

## Scripts

| Command              | What it does                           |
| -------------------- | -------------------------------------- |
| `npm run start:dev`  | Run the API in watch mode              |
| `npm run build`      | Production build                       |
| `npm test`           | Unit tests                             |
| `npm run test:e2e`   | End-to-end tests (needs a database)    |
| `npm run lint`       | ESLint over `src`, `test` and `prisma` |
| `npm run typecheck`  | Type-check without emitting            |
| `npm run format`     | Apply Prettier                         |
| `npm run db:migrate` | Apply Prisma migrations                |
| `npm run db:seed`    | Seed the database (idempotent)         |
| `npm run db:reset`   | Drop, re-migrate and re-seed           |

## Conventions

Module structure, the testing bar, and the git workflow are defined in the project specification documents. In short:

- Every domain module is `dto/`, controller, service, module, `index.ts`, plus a spec file per layer.
- Controllers are HTTP-only; business logic and Prisma access live in services.
- Cross-module calls go service → service, imported from the module's `index.ts`.
- `dev` is the integration branch; feature branches are `<type>/<ticket>-<description>` and merge via reviewed PR.

`src/users` is the reference implementation to copy when adding a module.

## API shape

Responses are wrapped:

```json
{ "data": { "id": "…", "email": "…" } }
```

Errors go through the global filter:

```json
{
  "statusCode": 404,
  "message": "User not found",
  "error": "NOT_FOUND",
  "path": "/users/123",
  "timestamp": "2026-09-18T10:00:00.000Z"
}
```
