import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { UserRole } from '@agregator/shared';
import { RolesGuard } from './roles';

function contextFor(roles: UserRole[] | undefined, userRole?: UserRole): ExecutionContext {
  const reflector = { getAllAndOverride: () => roles } as unknown as Reflector;
  const guard = new RolesGuard(reflector);
  const context = {
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({
      getRequest: () => (userRole ? { auth: { user: { role: userRole } } } : {}),
    }),
  } as unknown as ExecutionContext;
  return Object.assign(context, { guard });
}

const check = (roles: UserRole[] | undefined, userRole?: UserRole) => {
  const ctx = contextFor(roles, userRole) as ExecutionContext & { guard: RolesGuard };
  return () => ctx.guard.canActivate(ctx);
};

describe('RolesGuard', () => {
  it('allows when no roles are required', () => {
    expect(check(undefined, 'CUSTOMER')()).toBe(true);
  });

  it('allows a matching role', () => {
    expect(check(['CONTRACTOR'], 'CONTRACTOR')()).toBe(true);
  });

  it('forbids another role', () => {
    expect(check(['CONTRACTOR'], 'CUSTOMER')).toThrow(ForbiddenException);
  });

  it('fails closed when the route has no session', () => {
    expect(check(['ADMIN'])).toThrow(ForbiddenException);
  });
});
