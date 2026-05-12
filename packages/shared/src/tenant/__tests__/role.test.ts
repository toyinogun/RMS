import { describe, expect, test } from 'vitest';
import { hasRole, requireRole } from '../index.js';
import type { TenantContext } from '../index.js';

const baseCtx = (role: 'OWNER' | 'ADMIN' | 'STAFF'): TenantContext => ({
  tenantId: '01935b7e-0000-7000-8000-000000000001',
  user: {
    id: '01935b7e-0000-7000-8000-000000000010',
    authUserId: '01935b7e-0000-7000-8000-000000000020',
    role,
    email: 'u@example.com',
    mustChangePassword: false,
  },
});

describe('role helpers', () => {
  test('hasRole — OWNER matches OWNER allow-list', () => {
    expect(hasRole(baseCtx('OWNER'), ['OWNER'])).toBe(true);
  });

  test('hasRole — STAFF rejected from OWNER allow-list', () => {
    expect(hasRole(baseCtx('STAFF'), ['OWNER'])).toBe(false);
  });

  test('hasRole — ADMIN matches when allow-list includes ADMIN', () => {
    expect(hasRole(baseCtx('ADMIN'), ['OWNER', 'ADMIN'])).toBe(true);
  });

  test('requireRole — passes silently when role is allowed', () => {
    expect(() => requireRole(baseCtx('OWNER'), ['OWNER'])).not.toThrow();
  });

  test('requireRole — throws ForbiddenError when not allowed', () => {
    expect(() => requireRole(baseCtx('STAFF'), ['OWNER'])).toThrow(/Forbidden/);
  });
});
