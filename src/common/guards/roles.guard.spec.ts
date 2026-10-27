import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import { type ExecutionContext, Logger, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '../../generated/prisma/enums';
import {
  MIN_ROLE_KEY,
  MinRole,
  ROLE_RANK,
} from '../decorators/min-role.decorator';
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

@Roles(Role.EDITOR, Role.ADMIN)
class MixedController {
  @MinRole(Role.PUBLISHER)
  publish() {}
}

@MinRole(Role.EDITOR)
class EditorController {
  list() {}

  @MinRole(Role.ADMIN)
  adminOnly() {}
}

const minRoleController = (role: Role) => {
  class MinRoleController {
    handle() {}
  }
  MinRole(role)(MinRoleController);
  return MinRoleController;
};

const createContext = (
  controller: new () => object,
  handler: string,
  user?: AuthenticatedUser,
): ExecutionContext =>
  ({
    getClass: () => controller,
    getHandler: () =>
      (controller.prototype as Record<string, () => void>)[handler],
    switchToHttp: () => ({
      getRequest: () => ({
        user,
        method: 'GET',
        route: { path: '/api/v1/probe' },
      }),
    }),
  }) as unknown as ExecutionContext;

const userWithRole = (role: Role): AuthenticatedUser => ({
  id: '3f2b8c1e-6a4d-4e2f-9b7a-1c5d8e0f2a6b',
  email: 'someone@example.com',
  role,
});

const ladder = [
  Role.USER,
  Role.EDITOR,
  Role.REVIEWER,
  Role.PUBLISHER,
  Role.ADMIN,
];

describe('RolesGuard', () => {
  let guard: RolesGuard;
  let warn: jest.SpiedFunction<Logger['warn']>;

  beforeEach(() => {
    guard = new RolesGuard(new Reflector());
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warn.mockRestore();
  });

  describe('@Roles', () => {
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
      expect(warn).not.toHaveBeenCalled();
    });
  });

  describe('@MinRole', () => {
    it('defines the rank map explicitly', () => {
      expect(ROLE_RANK).toEqual({
        ADMIN: 4,
        PUBLISHER: 3,
        REVIEWER: 2,
        EDITOR: 1,
        USER: 0,
      });
    });

    const pairs = ladder.flatMap((userRole, userIndex) =>
      ladder.map(
        (minRole, minIndex) =>
          [userRole, minRole, userIndex >= minIndex] as const,
      ),
    );

    it.each(pairs)(
      '%s on @MinRole(%s) is allowed: %s',
      (userRole, minRole, allowed) => {
        const context = createContext(
          minRoleController(minRole),
          'handle',
          userWithRole(userRole),
        );

        expect(guard.canActivate(context)).toBe(allowed);
      },
    );

    it('rejects an unknown role', () => {
      const context = createContext(
        minRoleController(Role.USER),
        'handle',
        userWithRole('SUPERUSER' as Role),
      );

      expect(guard.canActivate(context)).toBe(false);
    });

    it('rejects a role name inherited from Object.prototype', () => {
      const context = createContext(
        minRoleController(Role.USER),
        'handle',
        userWithRole('constructor' as Role),
      );

      expect(guard.canActivate(context)).toBe(false);
    });

    it('rejects a request with no user', () => {
      const context = createContext(minRoleController(Role.USER), 'handle');

      expect(guard.canActivate(context)).toBe(false);
    });

    it('rejects every role on a rank outside the map', () => {
      class OffLadderController {
        handle() {}
      }
      SetMetadata(MIN_ROLE_KEY, 9)(OffLadderController);
      const context = createContext(
        OffLadderController,
        'handle',
        userWithRole(Role.ADMIN),
      );

      expect(guard.canActivate(context)).toBe(false);
      expect(warn).toHaveBeenCalledWith(
        expect.objectContaining({ requiredRole: null }),
        'Role check denied',
      );
    });

    it('lets a handler minimum override the controller minimum', () => {
      const editorList = createContext(
        EditorController,
        'list',
        userWithRole(Role.EDITOR),
      );
      const editorAdminOnly = createContext(
        EditorController,
        'adminOnly',
        userWithRole(Role.EDITOR),
      );

      expect(guard.canActivate(editorList)).toBe(true);
      expect(guard.canActivate(editorAdminOnly)).toBe(false);
    });
  });

  describe('@Roles with @MinRole', () => {
    it.each([
      [Role.EDITOR, false],
      [Role.REVIEWER, false],
      [Role.PUBLISHER, false],
      [Role.ADMIN, true],
    ])('requires both checks to pass for %s', (role, allowed) => {
      const context = createContext(
        MixedController,
        'publish',
        userWithRole(role),
      );

      expect(guard.canActivate(context)).toBe(allowed);
    });
  });

  describe('logging', () => {
    it('warns on a denial with the route and required role', () => {
      const context = createContext(
        minRoleController(Role.REVIEWER),
        'handle',
        userWithRole(Role.EDITOR),
      );

      guard.canActivate(context);

      expect(warn).toHaveBeenCalledWith(
        {
          route: 'GET /api/v1/probe',
          requiredRole: Role.REVIEWER,
          allowedRoles: null,
          userId: '3f2b8c1e-6a4d-4e2f-9b7a-1c5d8e0f2a6b',
          reason: 'INSUFFICIENT_ROLE',
        },
        'Role check denied',
      );
    });

    it('logs the allowed roles of a @Roles denial and never the email', () => {
      const context = createContext(
        AdminController,
        'list',
        userWithRole(Role.USER),
      );

      guard.canActivate(context);

      expect(warn).toHaveBeenCalledWith(
        expect.objectContaining({
          requiredRole: null,
          allowedRoles: [Role.ADMIN],
        }),
        'Role check denied',
      );
      expect(JSON.stringify(warn.mock.calls)).not.toContain(
        'someone@example.com',
      );
    });

    it('logs a null user id when there is no user', () => {
      guard.canActivate(createContext(AdminController, 'list'));

      expect(warn).toHaveBeenCalledWith(
        expect.objectContaining({ userId: null }),
        'Role check denied',
      );
    });

    it('does not warn on an allowed request', () => {
      guard.canActivate(
        createContext(
          minRoleController(Role.EDITOR),
          'handle',
          userWithRole(Role.ADMIN),
        ),
      );

      expect(warn).not.toHaveBeenCalled();
    });
  });
});
