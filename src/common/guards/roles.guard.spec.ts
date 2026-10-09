import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '../../generated/prisma/enums';
import { Roles } from '../decorators/roles.decorator';
import { AuthenticatedUser } from '../interfaces/authenticated-user.interface';
import { RolesGuard } from './roles.guard';

@Roles(Role.ADMIN)
class AdminController {
  list() {}

  @Roles(Role.USER)
  userOverride() {}
}

class OpenController {
  list() {}

  @Roles(Role.ADMIN)
  adminOnly() {}
}

const createContext = (
  controller: new () => object,
  handler: string,
  user?: AuthenticatedUser,
): ExecutionContext =>
  ({
    getClass: () => controller,
    getHandler: () =>
      (controller.prototype as Record<string, () => void>)[handler],
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  }) as unknown as ExecutionContext;

const userWithRole = (role: Role): AuthenticatedUser => ({
  id: '3f2b8c1e-6a4d-4e2f-9b7a-1c5d8e0f2a6b',
  email: 'someone@example.com',
  role,
});

describe('RolesGuard', () => {
  let guard: RolesGuard;

  beforeEach(() => {
    guard = new RolesGuard(new Reflector());
  });

  it('allows a user whose role is required by the controller', () => {
    const context = createContext(
      AdminController,
      'list',
      userWithRole(Role.ADMIN),
    );

    expect(guard.canActivate(context)).toBe(true);
  });

  it('rejects a user whose role is not required by the controller', () => {
    const context = createContext(
      AdminController,
      'list',
      userWithRole(Role.USER),
    );

    expect(guard.canActivate(context)).toBe(false);
  });

  it('rejects a request with no user when a role is required', () => {
    const context = createContext(AdminController, 'list');

    expect(guard.canActivate(context)).toBe(false);
  });

  it('lets handler roles override controller roles', () => {
    const userContext = createContext(
      AdminController,
      'userOverride',
      userWithRole(Role.USER),
    );
    const adminContext = createContext(
      AdminController,
      'userOverride',
      userWithRole(Role.ADMIN),
    );

    expect(guard.canActivate(userContext)).toBe(true);
    expect(guard.canActivate(adminContext)).toBe(false);
  });

  it('applies handler roles on a controller without roles', () => {
    const context = createContext(
      OpenController,
      'adminOnly',
      userWithRole(Role.USER),
    );

    expect(guard.canActivate(context)).toBe(false);
  });

  it('allows any request when no roles are required', () => {
    const context = createContext(OpenController, 'list');

    expect(guard.canActivate(context)).toBe(true);
  });
});
