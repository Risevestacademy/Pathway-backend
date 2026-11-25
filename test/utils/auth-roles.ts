import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../../src/prisma';
import { Role } from '../../src/generated/prisma/client';
import { registerAndVerify } from './auth';

export interface RoleUsers {
  ids: Record<Role, string>;
  emails: Record<Role, string>;
  tokens: Record<Role, string>;
  cleanup: () => Promise<void>;
}

/**
 * Register and verify one user per requested role, set their role, and log
 * them in. Returns ids, emails, tokens, and a `cleanup()` to delete the
 * users.
 *
 * Callers pass only the roles their spec uses. The default is all roles —
 * correct but slow; every spec should narrow it.
 *
 * All registrations run in parallel. `registerAndVerify` has no ordering
 * dependency between distinct emails (each has its own OTP key), so the
 * Promise.all is safe and turns 5 sequential round-trips into 1.
 */
export async function registerRoles(
  app: INestApplication,
  apiPrefix: string,
  prisma: PrismaService,
  opts: { password?: string; marker?: string; roles?: Role[] } = {},
): Promise<RoleUsers> {
  const roles = opts.roles ?? Object.values(Role);
  const password = opts.password ?? 'Password123!';
  const marker =
    opts.marker ??
    `e2e-roles-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const ids = {} as Record<Role, string>;
  const emails = {} as Record<Role, string>;
  const tokens = {} as Record<Role, string>;
  const userIds: string[] = [];

  // Register all requested roles in parallel.
  const registrations = await Promise.all(
    roles.map(async (role) => {
      const email = `${marker}-${role.toLowerCase()}@test.com`;
      const registered = await registerAndVerify(app, apiPrefix, {
        email,
        password,
      });
      return { role, email, registered };
    }),
  );

  // Set the role on each user, then log in. Role assignment must happen
  // before login (the token's role claim is read at login). Those two steps
  // can run in parallel per user, but not across users, so keep them in a
  // single loop. This is a small cost compared to registration.
  for (const { role, email, registered } of registrations) {
    userIds.push(registered.id);
    await prisma.user.update({
      where: { id: registered.id },
      data: { role },
    });
    const login = await request(app.getHttpServer())
      .post(`${apiPrefix}/auth/login`)
      .send({ email, password })
      .expect(200);
    ids[role] = registered.id;
    emails[role] = email;
    tokens[role] = (login.body as { accessToken: string }).accessToken;
  }

  return {
    ids,
    emails,
    tokens,
    cleanup: async () => {
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    },
  };
}
