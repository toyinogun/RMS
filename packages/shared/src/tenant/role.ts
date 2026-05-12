import type { TenantContext, UserRole } from './context.js';

export class ForbiddenError extends Error {
  constructor(required: UserRole[], actual: UserRole) {
    super(`Forbidden: required one of [${required.join(', ')}], actor has ${actual}`);
    this.name = 'ForbiddenError';
  }
}

export function hasRole(ctx: TenantContext, allowed: UserRole[]): boolean {
  return allowed.includes(ctx.user.role);
}

export function requireRole(ctx: TenantContext, allowed: UserRole[]): void {
  if (!hasRole(ctx, allowed)) throw new ForbiddenError(allowed, ctx.user.role);
}
