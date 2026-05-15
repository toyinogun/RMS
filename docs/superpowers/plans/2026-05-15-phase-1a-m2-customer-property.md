# Phase 1a · M2 — Customer & Property CRUD Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the M2 milestone from the Phase 1a design spec — Customer and Property CRUD with list/new/detail/edit/soft-delete pages, plus reusable inline `+ New customer` and `+ New property` dialogs that M3 plan-create will consume.

**Architecture:** Pure Zod schemas in `@solutio/shared/{customers,properties}/schemas.ts`; service-layer functions in `packages/db/src/customers-service.ts` and `properties-service.ts` that accept `(prisma, ctx, input)` and route through `forTenant(ctx.tenantId)`; server-actions in `apps/web/server-actions/{customers,properties}/*.ts` that validate, call the service, then `revalidatePath`; Next.js RSC list/detail/new/edit pages under `app/(authenticated)/{customers,properties}/`; shared `CustomerCreateDialog` + `PropertyCreateDialog` client components that wrap the same Zod resolver pattern react-hook-form expects.

**Tech Stack:** Next.js 16 RSC + Server Actions · Prisma 7 (`forTenant` extension) · Zod · react-hook-form + `@hookform/resolvers/zod` · shadcn/ui (already installed: button/input/label/select/dialog/table/tabs/badge/form/sonner) · Vitest (jsdom for components, testcontainers/postgres for DB integration) · Playwright (extend the existing happy-path with an M2 lane).

**Spec sections this plan implements:** `docs/superpowers/specs/2026-05-15-phase-1a-product-ui-design.md` §M2 (lines 219–230) plus the cross-cutting Architecture (§57–124) and Validation (§186–195) sections.

**Out of scope for M2 (locked by spec):**
- Plan/payment/user pages (M3–M6)
- `MoneyInput` shared component beyond what Property requires (final form lands in M3); the M2 property form uses a plain text input with Zod parse via `parseNgn` (already exported from `@solutio/shared/money`).
- Property → SOLD auto-flip (M3 implements it; M2 only supports manual status flipping between AVAILABLE/RESERVED, blocks SOLD with an error, and rejects status changes if any non-CANCELLED Plan references the property).

---

## File map

**Create:**
- `packages/shared/src/customers/schemas.ts`
- `packages/shared/src/customers/index.ts`
- `packages/shared/src/customers/__tests__/schemas.test.ts`
- `packages/shared/src/properties/schemas.ts`
- `packages/shared/src/properties/index.ts`
- `packages/shared/src/properties/__tests__/schemas.test.ts`
- `packages/db/src/customers-service.ts`
- `packages/db/src/properties-service.ts`
- `packages/db/__tests__/customers-service.integration.test.ts`
- `packages/db/__tests__/properties-service.integration.test.ts`
- `apps/web/server-actions/customers/create.ts`
- `apps/web/server-actions/customers/update.ts`
- `apps/web/server-actions/customers/soft-delete.ts`
- `apps/web/server-actions/properties/create.ts`
- `apps/web/server-actions/properties/update.ts`
- `apps/web/server-actions/properties/set-status.ts`
- `apps/web/server-actions/properties/soft-delete.ts`
- `apps/web/app/(authenticated)/customers/page.tsx`
- `apps/web/app/(authenticated)/customers/new/page.tsx`
- `apps/web/app/(authenticated)/customers/[id]/page.tsx`
- `apps/web/app/(authenticated)/customers/[id]/edit/page.tsx`
- `apps/web/app/(authenticated)/properties/page.tsx`
- `apps/web/app/(authenticated)/properties/new/page.tsx`
- `apps/web/app/(authenticated)/properties/[id]/page.tsx`
- `apps/web/app/(authenticated)/properties/[id]/edit/page.tsx`
- `apps/web/components/customers/customer-form.tsx` (shared client component used by new + edit + dialog)
- `apps/web/components/customers/customer-create-dialog.tsx`
- `apps/web/components/properties/property-form.tsx`
- `apps/web/components/properties/property-create-dialog.tsx`
- `apps/web/components/__tests__/customer-form.test.tsx`
- `apps/web/components/__tests__/property-form.test.tsx`
- `apps/web/e2e/m2-customer-property.e2e.ts`

**Modify:**
- `packages/shared/src/index.ts` (add `customers` + `properties` re-exports)
- `packages/db/src/index.ts` (export new service functions + their input types)
- `packages/db/package.json` — no change expected
- `apps/web/app/(authenticated)/page.tsx` — replace the placeholder paragraph with a link to `/customers` and `/properties`

**Touch only if a step requires it (do NOT modify pre-emptively):**
- `packages/db/prisma/schema.prisma` — M2 ships zero schema changes; if a step requires one, stop and escalate.

---

## Cross-cutting conventions (read before starting Task 1)

1. **All shared package files use the `.js` import suffix in source.** This is the established ESM convention; do not "fix" it.
2. **`apps/web` imports `@solutio/db` via submodule paths only** (`@solutio/db/tenant-client`, never the barrel). Per memory `feedback_apps_web_imports_db_via_submodules`.
3. **Service-layer functions always take `(prisma, ctx, input)`** — `prisma` first, then explicit `TenantContext`, then a typed input. They never call `getTenantContext()`. Per memory `feedback_service_layer_explicit_ctx_param`.
4. **forTenant writes need `satisfies Omit<Prisma.<Model>CreateInput, 'tenantId'>` + `as unknown as Prisma.<Model>CreateInput`** because `$extends` injects tenantId at runtime but static types don't reflect that. Per memory `feedback_prisma_fortenant_needs_cast`. Pattern lives in `packages/db/src/payments-service.ts` — copy the structure.
5. **Soft-delete pattern:** every list query filters `where: { deletedAt: null }`. The partial indexes already exist (`customer_active_idx`, `property_active_idx`). Per memory `feedback_partial_indexes_for_soft_delete`.
6. **Server-action return contract:** `{ ok: true, data } | { ok: false, message, fieldErrors? }` (spec §195). Throw nothing back to the client component; map Prisma errors here.
7. **Auth gate:** `app/(authenticated)/layout.tsx` already enforces auth; every M2 page must call `await getTenantContext()` and `redirect('/login')` if null (defense-in-depth — never assume the layout already enforced).
8. **Money in/out:** Properties have `totalPriceKobo BigInt`. The form takes a free-form NGN string and the schema runs it through `parseNgn` from `@solutio/shared/money`. Display uses `formatKobo`.
9. **Phone normalisation:** Customer.phone is required, string. Schema must `.trim()` and `.min(7)` — no carrier validation. Stored as-typed (we are not building international dial-code parsing for Atrium's local phones).
10. **`createdBy`:** every create writes `createdBy: ctx.user.id`. Updates do not touch it.

---

## Task 0: Smoke-test baseline + verify Prisma client is generated

**Files:**
- None (verification only)

- [ ] **Step 0.1: Confirm Prisma client is generated**

```bash
ls -d node_modules/.pnpm/@prisma+client@7.8.0_*/node_modules/.prisma/client 2>/dev/null
```

Expected: a path is printed. If empty, run:

```bash
DATABASE_URL="postgresql://stub:stub@localhost:5432/stub" pnpm --filter @solutio/db prisma:generate
```

- [ ] **Step 0.2: Run full test baseline**

```bash
pnpm test
```

Expected: `Test Files 14 passed (14)`, `Tests 76 passed (76)`. If anything fails, STOP and report — do not start M2 against a broken baseline.

- [ ] **Step 0.3: Confirm Docker is reachable (testcontainers)**

```bash
docker info >/dev/null 2>&1 && echo OK || echo "Docker not running"
```

Expected: `OK`. The integration suites in Tasks 4 and 8 require it.

---

## Task 1: Customer Zod schemas in `@solutio/shared`

**Files:**
- Create: `packages/shared/src/customers/schemas.ts`
- Create: `packages/shared/src/customers/index.ts`
- Create: `packages/shared/src/customers/__tests__/schemas.test.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1.1: Write the failing test**

Create `packages/shared/src/customers/__tests__/schemas.test.ts`:

```ts
import { describe, expect, test } from 'vitest';
import {
  customerCreateSchema,
  customerUpdateSchema,
  customerIdSchema,
} from '../schemas.js';

describe('customerCreateSchema', () => {
  test('accepts a minimal valid customer (fullName + phone)', () => {
    const result = customerCreateSchema.safeParse({
      fullName: 'Adaeze Okafor',
      phone: '+2348012345001',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.fullName).toBe('Adaeze Okafor');
      expect(result.data.phone).toBe('+2348012345001');
      expect(result.data.email).toBeUndefined();
      expect(result.data.nationalId).toBeUndefined();
      expect(result.data.notes).toBeUndefined();
    }
  });

  test('trims surrounding whitespace on fullName and phone', () => {
    const result = customerCreateSchema.safeParse({
      fullName: '  Adaeze Okafor  ',
      phone: '  +2348012345001  ',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.fullName).toBe('Adaeze Okafor');
      expect(result.data.phone).toBe('+2348012345001');
    }
  });

  test('rejects empty fullName', () => {
    const result = customerCreateSchema.safeParse({ fullName: '   ', phone: '+2348012345001' });
    expect(result.success).toBe(false);
  });

  test('rejects phone shorter than 7 chars after trim', () => {
    const result = customerCreateSchema.safeParse({ fullName: 'A', phone: '12345' });
    expect(result.success).toBe(false);
  });

  test('rejects invalid email when email is provided', () => {
    const result = customerCreateSchema.safeParse({
      fullName: 'A',
      phone: '+2348012345001',
      email: 'not-an-email',
    });
    expect(result.success).toBe(false);
  });

  test('accepts empty-string email as undefined (form convenience)', () => {
    const result = customerCreateSchema.safeParse({
      fullName: 'A',
      phone: '+2348012345001',
      email: '',
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.email).toBeUndefined();
  });

  test('caps notes at 1000 chars', () => {
    const result = customerCreateSchema.safeParse({
      fullName: 'A',
      phone: '+2348012345001',
      notes: 'x'.repeat(1001),
    });
    expect(result.success).toBe(false);
  });
});

describe('customerUpdateSchema', () => {
  test('requires id alongside all other fields', () => {
    const result = customerUpdateSchema.safeParse({
      id: '01935b7e-0000-7000-8000-000000000abc',
      fullName: 'Renamed',
      phone: '+2348012345001',
    });
    expect(result.success).toBe(true);
  });

  test('rejects malformed UUID', () => {
    const result = customerUpdateSchema.safeParse({
      id: 'not-a-uuid',
      fullName: 'A',
      phone: '+2348012345001',
    });
    expect(result.success).toBe(false);
  });
});

describe('customerIdSchema', () => {
  test('accepts a valid UUID', () => {
    const result = customerIdSchema.safeParse({ id: '01935b7e-0000-7000-8000-000000000abc' });
    expect(result.success).toBe(true);
  });
});
```

- [ ] **Step 1.2: Run the test to verify it fails**

```bash
pnpm --filter @solutio/shared test
```

Expected: FAIL — `Cannot find module '../schemas.js'`.

- [ ] **Step 1.3: Implement the schemas**

Create `packages/shared/src/customers/schemas.ts`:

```ts
import { z } from 'zod';

const optionalEmail = z
  .string()
  .trim()
  .transform((v) => (v === '' ? undefined : v))
  .optional()
  .refine((v) => v === undefined || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), {
    message: 'Invalid email',
  });

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .transform((v) => (v === '' ? undefined : v))
    .optional()
    .refine((v) => v === undefined || v.length <= max, {
      message: `Must be ${max} characters or fewer`,
    });

export const customerCreateSchema = z.object({
  fullName: z.string().trim().min(1, 'Required').max(200),
  phone: z.string().trim().min(7, 'Phone must be at least 7 characters').max(40),
  email: optionalEmail,
  nationalId: optionalText(60),
  notes: optionalText(1000),
});
export type CustomerCreateInput = z.infer<typeof customerCreateSchema>;

export const customerUpdateSchema = customerCreateSchema.extend({
  id: z.string().uuid(),
});
export type CustomerUpdateInput = z.infer<typeof customerUpdateSchema>;

export const customerIdSchema = z.object({ id: z.string().uuid() });
export type CustomerIdInput = z.infer<typeof customerIdSchema>;
```

Create `packages/shared/src/customers/index.ts`:

```ts
export * from './schemas.js';
```

Modify `packages/shared/src/index.ts` — append:

```ts
export * as customers from './customers/index.js';
```

(Read the existing file first; preserve all existing exports.)

- [ ] **Step 1.4: Run the test to verify it passes**

```bash
pnpm --filter @solutio/shared test
```

Expected: PASS — all 9 new tests green, no regressions in existing shared tests.

- [ ] **Step 1.5: Commit**

```bash
git add packages/shared/src/customers packages/shared/src/index.ts
git commit -m "feat(shared/customers): Zod schemas for create/update/id"
```

---

## Task 2: Property Zod schemas in `@solutio/shared`

**Files:**
- Create: `packages/shared/src/properties/schemas.ts`
- Create: `packages/shared/src/properties/index.ts`
- Create: `packages/shared/src/properties/__tests__/schemas.test.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 2.1: Write the failing test**

Create `packages/shared/src/properties/__tests__/schemas.test.ts`:

```ts
import { describe, expect, test } from 'vitest';
import {
  propertyCreateSchema,
  propertyUpdateSchema,
  propertyStatusSchema,
  propertySetStatusSchema,
} from '../schemas.js';

describe('propertyCreateSchema', () => {
  test('accepts a minimal valid property', () => {
    const result = propertyCreateSchema.safeParse({
      code: 'AT-001',
      title: '3-bed terrace',
      addressLine: '12 Marina Road',
      city: 'Lagos',
      totalPriceNgn: '50,000,000',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.totalPriceKobo).toBe(5_000_000_000_00n);
    }
  });

  test('uppercases code and trims', () => {
    const result = propertyCreateSchema.safeParse({
      code: '  at-001  ',
      title: 'X',
      addressLine: '12 Marina',
      city: 'Lagos',
      totalPriceNgn: '1,000',
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.code).toBe('AT-001');
  });

  test('rejects code with disallowed characters', () => {
    const result = propertyCreateSchema.safeParse({
      code: 'at 001!',
      title: 'X',
      addressLine: '12 Marina',
      city: 'Lagos',
      totalPriceNgn: '1,000',
    });
    expect(result.success).toBe(false);
  });

  test('rejects non-positive totalPrice', () => {
    const result = propertyCreateSchema.safeParse({
      code: 'AT-002',
      title: 'X',
      addressLine: '12 Marina',
      city: 'Lagos',
      totalPriceNgn: '0',
    });
    expect(result.success).toBe(false);
  });

  test('rejects unparseable totalPrice', () => {
    const result = propertyCreateSchema.safeParse({
      code: 'AT-003',
      title: 'X',
      addressLine: '12 Marina',
      city: 'Lagos',
      totalPriceNgn: 'not money',
    });
    expect(result.success).toBe(false);
  });
});

describe('propertyUpdateSchema', () => {
  test('requires id', () => {
    const result = propertyUpdateSchema.safeParse({
      id: '01935b7e-0000-7000-8000-000000000abc',
      code: 'AT-001',
      title: 'X',
      addressLine: '12 Marina',
      city: 'Lagos',
      totalPriceNgn: '1,000',
    });
    expect(result.success).toBe(true);
  });
});

describe('propertyStatusSchema', () => {
  test('accepts AVAILABLE and RESERVED', () => {
    expect(propertyStatusSchema.safeParse('AVAILABLE').success).toBe(true);
    expect(propertyStatusSchema.safeParse('RESERVED').success).toBe(true);
  });

  test('rejects SOLD (M2 cannot transition to SOLD manually)', () => {
    expect(propertyStatusSchema.safeParse('SOLD').success).toBe(false);
  });
});

describe('propertySetStatusSchema', () => {
  test('shape', () => {
    const result = propertySetStatusSchema.safeParse({
      id: '01935b7e-0000-7000-8000-000000000abc',
      status: 'RESERVED',
    });
    expect(result.success).toBe(true);
  });
});
```

- [ ] **Step 2.2: Run the test to verify it fails**

```bash
pnpm --filter @solutio/shared test
```

Expected: FAIL.

- [ ] **Step 2.3: Implement the schemas**

Create `packages/shared/src/properties/schemas.ts`:

```ts
import { z } from 'zod';
import { parseNgn } from '../money/parse.js';

const codeRegex = /^[A-Z0-9][A-Z0-9-]{0,31}$/;

const ngnAmountSchema = z
  .string()
  .trim()
  .min(1, 'Required')
  .transform((raw, ctx) => {
    try {
      const kobo = parseNgn(raw);
      if (kobo <= 0n) {
        ctx.addIssue({ code: 'custom', message: 'Must be greater than zero' });
        return z.NEVER;
      }
      return kobo;
    } catch {
      ctx.addIssue({ code: 'custom', message: 'Invalid amount' });
      return z.NEVER;
    }
  });

const propertyCoreFields = {
  code: z
    .string()
    .trim()
    .transform((v) => v.toUpperCase())
    .pipe(z.string().regex(codeRegex, 'Use letters, digits, and dashes only')),
  title: z.string().trim().min(1).max(200),
  addressLine: z.string().trim().min(1).max(300),
  city: z.string().trim().min(1).max(120),
} as const;

export const propertyCreateSchema = z
  .object({
    ...propertyCoreFields,
    totalPriceNgn: ngnAmountSchema,
  })
  .transform(({ totalPriceNgn, ...rest }) => ({
    ...rest,
    totalPriceKobo: totalPriceNgn,
  }));
export type PropertyCreateInput = z.infer<typeof propertyCreateSchema>;

export const propertyUpdateSchema = z
  .object({
    id: z.string().uuid(),
    ...propertyCoreFields,
    totalPriceNgn: ngnAmountSchema,
  })
  .transform(({ totalPriceNgn, ...rest }) => ({
    ...rest,
    totalPriceKobo: totalPriceNgn,
  }));
export type PropertyUpdateInput = z.infer<typeof propertyUpdateSchema>;

// M2 cannot manually transition to SOLD — that's M3's auto-flip.
export const propertyStatusSchema = z.enum(['AVAILABLE', 'RESERVED']);
export type PropertyStatusInput = z.infer<typeof propertyStatusSchema>;

export const propertySetStatusSchema = z.object({
  id: z.string().uuid(),
  status: propertyStatusSchema,
});
export type PropertySetStatusInput = z.infer<typeof propertySetStatusSchema>;

export const propertyIdSchema = z.object({ id: z.string().uuid() });
export type PropertyIdInput = z.infer<typeof propertyIdSchema>;
```

Create `packages/shared/src/properties/index.ts`:

```ts
export * from './schemas.js';
```

Modify `packages/shared/src/index.ts` — append:

```ts
export * as properties from './properties/index.js';
```

- [ ] **Step 2.4: Run the test to verify it passes**

```bash
pnpm --filter @solutio/shared test
```

Expected: PASS.

- [ ] **Step 2.5: Commit**

```bash
git add packages/shared/src/properties packages/shared/src/index.ts
git commit -m "feat(shared/properties): Zod schemas for create/update/status (no SOLD in M2)"
```

---

## Task 3: Customer service-layer functions in `@solutio/db`

**Files:**
- Create: `packages/db/src/customers-service.ts`
- Modify: `packages/db/src/index.ts`

- [ ] **Step 3.1: Implement the service**

Read `packages/db/src/payments-service.ts` first — copy its structure (PrismaClient + ctx params, `forTenant`, `satisfies … as unknown as …` cast pattern, error handling).

Create `packages/db/src/customers-service.ts`:

```ts
import { Prisma, PrismaClient } from '@prisma/client';
import type { TenantContext } from '@solutio/shared/tenant';
import type { CustomerCreateInput, CustomerUpdateInput } from '@solutio/shared/customers';
import { forTenant } from './tenant-client.js';

export class CustomerNotFoundError extends Error {
  constructor(id: string) {
    super(`Customer not found: ${id}`);
    this.name = 'CustomerNotFoundError';
  }
}

export class CustomerHasPlansError extends Error {
  constructor(id: string, planCount: number) {
    super(`Cannot delete customer ${id}: ${planCount} non-cancelled plan(s) reference it`);
    this.name = 'CustomerHasPlansError';
  }
}

export async function createCustomer(
  prisma: PrismaClient,
  ctx: TenantContext,
  input: CustomerCreateInput,
) {
  const scoped = forTenant(prisma, ctx.tenantId);
  const data = {
    fullName: input.fullName,
    phone: input.phone,
    email: input.email ?? null,
    nationalId: input.nationalId ?? null,
    notes: input.notes ?? null,
    createdBy: ctx.user.id,
  } satisfies Omit<Prisma.CustomerCreateInput, 'tenant'>;
  return scoped.customer.create({ data: data as unknown as Prisma.CustomerCreateInput });
}

export async function updateCustomer(
  prisma: PrismaClient,
  ctx: TenantContext,
  input: CustomerUpdateInput,
) {
  const scoped = forTenant(prisma, ctx.tenantId);
  const existing = await scoped.customer.findUnique({ where: { id: input.id } });
  if (!existing || existing.deletedAt) throw new CustomerNotFoundError(input.id);
  return scoped.customer.update({
    where: { id: input.id },
    data: {
      fullName: input.fullName,
      phone: input.phone,
      email: input.email ?? null,
      nationalId: input.nationalId ?? null,
      notes: input.notes ?? null,
    },
  });
}

export async function softDeleteCustomer(
  prisma: PrismaClient,
  ctx: TenantContext,
  id: string,
) {
  const scoped = forTenant(prisma, ctx.tenantId);
  const existing = await scoped.customer.findUnique({
    where: { id },
    include: {
      plans: {
        where: { status: { not: 'CANCELLED' }, deletedAt: null },
        select: { id: true },
      },
    },
  });
  if (!existing || existing.deletedAt) throw new CustomerNotFoundError(id);
  if (existing.plans.length > 0) {
    throw new CustomerHasPlansError(id, existing.plans.length);
  }
  return scoped.customer.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
}

export async function listCustomers(
  prisma: PrismaClient,
  ctx: TenantContext,
  opts: { search?: string; take?: number; cursor?: string } = {},
) {
  const scoped = forTenant(prisma, ctx.tenantId);
  const search = opts.search?.trim();
  return scoped.customer.findMany({
    where: {
      deletedAt: null,
      ...(search
        ? {
            OR: [
              { fullName: { contains: search, mode: 'insensitive' } },
              { phone: { contains: search } },
              { email: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: opts.take ?? 50,
    ...(opts.cursor ? { skip: 1, cursor: { id: opts.cursor } } : {}),
  });
}

export async function getCustomer(
  prisma: PrismaClient,
  ctx: TenantContext,
  id: string,
) {
  const scoped = forTenant(prisma, ctx.tenantId);
  const row = await scoped.customer.findUnique({
    where: { id },
    include: {
      plans: {
        where: { deletedAt: null },
        select: { id: true, status: true, totalPriceKobo: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
      },
    },
  });
  if (!row || row.deletedAt) return null;
  return row;
}
```

Modify `packages/db/src/index.ts` — append:

```ts
export {
  createCustomer,
  updateCustomer,
  softDeleteCustomer,
  listCustomers,
  getCustomer,
  CustomerNotFoundError,
  CustomerHasPlansError,
} from './customers-service.js';
```

- [ ] **Step 3.2: Typecheck**

```bash
pnpm --filter @solutio/db typecheck
```

Expected: PASS. If a `satisfies` mismatch fires, copy the exact shape used by `payments-service.ts`.

- [ ] **Step 3.3: Commit**

```bash
git add packages/db/src/customers-service.ts packages/db/src/index.ts
git commit -m "feat(db/customers): create/update/soft-delete/list service"
```

---

## Task 4: Customer service integration tests

**Files:**
- Create: `packages/db/__tests__/customers-service.integration.test.ts`

- [ ] **Step 4.1: Write the failing test**

Create `packages/db/__tests__/customers-service.integration.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { startPostgres, type TestPostgres } from './_helpers/postgres.js';
import {
  createCustomer,
  updateCustomer,
  softDeleteCustomer,
  listCustomers,
  getCustomer,
  CustomerNotFoundError,
  CustomerHasPlansError,
} from '../src/customers-service.js';
import type { TenantContext } from '@solutio/shared/tenant';

let pg: TestPostgres;
const TENANT_A = '01935b7e-0000-7000-8000-000000000001';
const TENANT_B = '01935b7e-0000-7000-8000-000000000002';

const ctxFor = (tenantId: string): TenantContext => ({
  tenantId,
  user: {
    id: '01935b7e-0000-7000-8000-aaaaaaaaaaaa',
    authUserId: '01935b7e-0000-7000-8000-bbbbbbbbbbbb',
    role: 'OWNER',
    email: 'owner@test',
    mustChangePassword: false,
  },
});

beforeAll(async () => {
  pg = await startPostgres();
  await pg.prisma.tenant.createMany({
    data: [
      { id: TENANT_A, slug: 'tenant-a', name: 'A' },
      { id: TENANT_B, slug: 'tenant-b', name: 'B' },
    ],
  });
}, 60_000);

afterAll(async () => {
  await pg?.stop();
});

describe('customers-service', () => {
  test('createCustomer auto-injects tenantId and createdBy', async () => {
    const ctx = ctxFor(TENANT_A);
    const created = await createCustomer(pg.prisma, ctx, {
      fullName: 'Adaeze Okafor',
      phone: '+2348012345001',
    });
    expect(created.tenantId).toBe(TENANT_A);
    expect(created.createdBy).toBe(ctx.user.id);
    expect(created.deletedAt).toBeNull();
  });

  test('updateCustomer changes fields but leaves tenantId untouched', async () => {
    const ctx = ctxFor(TENANT_A);
    const created = await createCustomer(pg.prisma, ctx, {
      fullName: 'Original Name',
      phone: '+2348012345002',
    });
    const updated = await updateCustomer(pg.prisma, ctx, {
      id: created.id,
      fullName: 'Renamed',
      phone: '+2348012345002',
      email: 'new@example.com',
    });
    expect(updated.fullName).toBe('Renamed');
    expect(updated.email).toBe('new@example.com');
    expect(updated.tenantId).toBe(TENANT_A);
  });

  test('updateCustomer throws CustomerNotFoundError for unknown id', async () => {
    const ctx = ctxFor(TENANT_A);
    await expect(
      updateCustomer(pg.prisma, ctx, {
        id: '01935b7e-0000-7000-8000-ffffffffffff',
        fullName: 'X',
        phone: '+2348012345099',
      }),
    ).rejects.toBeInstanceOf(CustomerNotFoundError);
  });

  test('cross-tenant update is invisible (treated as not found)', async () => {
    const ctxA = ctxFor(TENANT_A);
    const ctxB = ctxFor(TENANT_B);
    const inA = await createCustomer(pg.prisma, ctxA, {
      fullName: 'Tenant A Customer',
      phone: '+2348012345003',
    });
    await expect(
      updateCustomer(pg.prisma, ctxB, {
        id: inA.id,
        fullName: 'Hijack',
        phone: '+2348012345003',
      }),
    ).rejects.toBeInstanceOf(CustomerNotFoundError);
  });

  test('softDeleteCustomer sets deletedAt and removes from listCustomers', async () => {
    const ctx = ctxFor(TENANT_A);
    const created = await createCustomer(pg.prisma, ctx, {
      fullName: 'Will Be Deleted',
      phone: '+2348012345004',
    });
    await softDeleteCustomer(pg.prisma, ctx, created.id);
    const list = await listCustomers(pg.prisma, ctx);
    expect(list.some((c) => c.id === created.id)).toBe(false);
    const fetched = await getCustomer(pg.prisma, ctx, created.id);
    expect(fetched).toBeNull();
  });

  test('softDeleteCustomer throws CustomerHasPlansError when active plans reference it', async () => {
    const ctx = ctxFor(TENANT_A);
    const customer = await createCustomer(pg.prisma, ctx, {
      fullName: 'Has Plans',
      phone: '+2348012345005',
    });
    // Insert a Property + Plan directly via the unscoped prisma client.
    const property = await pg.prisma.property.create({
      data: {
        tenantId: TENANT_A,
        code: 'PLN-CHK-1',
        title: 'X',
        addressLine: 'X',
        city: 'X',
        totalPriceKobo: 100_000_00n,
      },
    });
    await pg.prisma.plan.create({
      data: {
        tenantId: TENANT_A,
        customerId: customer.id,
        propertyId: property.id,
        totalPriceKobo: 100_000_00n,
        depositKobo: 0n,
        monthlyKobo: 100_000_00n,
        termMonths: 1,
        startDate: new Date('2026-06-01'),
        status: 'ACTIVE',
      },
    });
    await expect(softDeleteCustomer(pg.prisma, ctx, customer.id)).rejects.toBeInstanceOf(
      CustomerHasPlansError,
    );
  });

  test('listCustomers filters by case-insensitive name/phone/email search', async () => {
    const ctx = ctxFor(TENANT_A);
    await createCustomer(pg.prisma, ctx, {
      fullName: 'Searchable Person',
      phone: '+2348011111111',
      email: 'search@example.com',
    });
    const byName = await listCustomers(pg.prisma, ctx, { search: 'searchable' });
    const byPhone = await listCustomers(pg.prisma, ctx, { search: '8011111111' });
    const byEmail = await listCustomers(pg.prisma, ctx, { search: 'SEARCH@example' });
    expect(byName.some((c) => c.fullName === 'Searchable Person')).toBe(true);
    expect(byPhone.some((c) => c.fullName === 'Searchable Person')).toBe(true);
    expect(byEmail.some((c) => c.fullName === 'Searchable Person')).toBe(true);
  });

  test('listCustomers does not return tenant B rows', async () => {
    const ctxA = ctxFor(TENANT_A);
    const ctxB = ctxFor(TENANT_B);
    await createCustomer(pg.prisma, ctxB, {
      fullName: 'Tenant B Only',
      phone: '+2348099999999',
    });
    const listA = await listCustomers(pg.prisma, ctxA);
    expect(listA.some((c) => c.fullName === 'Tenant B Only')).toBe(false);
  });
});
```

- [ ] **Step 4.2: Run the test to verify it fails for the right reasons**

```bash
pnpm --filter @solutio/db test:integration
```

Expected: passes for the cases where the service already works; fails only if Task 3 has a bug. If it passes entirely on first run, that means Task 3 is implemented correctly — proceed.

- [ ] **Step 4.3: Commit**

```bash
git add packages/db/__tests__/customers-service.integration.test.ts
git commit -m "test(db/customers): integration coverage for create/update/delete/list"
```

---

## Task 5: Property service-layer functions in `@solutio/db`

**Files:**
- Create: `packages/db/src/properties-service.ts`
- Modify: `packages/db/src/index.ts`

- [ ] **Step 5.1: Implement the service**

Create `packages/db/src/properties-service.ts`:

```ts
import { Prisma, PrismaClient } from '@prisma/client';
import type { TenantContext } from '@solutio/shared/tenant';
import type {
  PropertyCreateInput,
  PropertyUpdateInput,
  PropertyStatusInput,
} from '@solutio/shared/properties';
import { forTenant } from './tenant-client.js';

export class PropertyNotFoundError extends Error {
  constructor(id: string) {
    super(`Property not found: ${id}`);
    this.name = 'PropertyNotFoundError';
  }
}

export class PropertyCodeConflictError extends Error {
  constructor(code: string) {
    super(`Property code already in use: ${code}`);
    this.name = 'PropertyCodeConflictError';
  }
}

export class PropertyStatusChangeBlockedError extends Error {
  constructor(id: string, reason: string) {
    super(`Cannot change status of property ${id}: ${reason}`);
    this.name = 'PropertyStatusChangeBlockedError';
  }
}

export class PropertyHasPlansError extends Error {
  constructor(id: string, planCount: number) {
    super(`Cannot delete property ${id}: ${planCount} non-cancelled plan(s) reference it`);
    this.name = 'PropertyHasPlansError';
  }
}

function isUniqueConstraintError(err: unknown): err is Prisma.PrismaClientKnownRequestError {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
}

export async function createProperty(
  prisma: PrismaClient,
  ctx: TenantContext,
  input: PropertyCreateInput,
) {
  const scoped = forTenant(prisma, ctx.tenantId);
  const data = {
    code: input.code,
    title: input.title,
    addressLine: input.addressLine,
    city: input.city,
    totalPriceKobo: input.totalPriceKobo,
    createdBy: ctx.user.id,
  } satisfies Omit<Prisma.PropertyCreateInput, 'tenant'>;
  try {
    return await scoped.property.create({ data: data as unknown as Prisma.PropertyCreateInput });
  } catch (err) {
    if (isUniqueConstraintError(err)) throw new PropertyCodeConflictError(input.code);
    throw err;
  }
}

export async function updateProperty(
  prisma: PrismaClient,
  ctx: TenantContext,
  input: PropertyUpdateInput,
) {
  const scoped = forTenant(prisma, ctx.tenantId);
  const existing = await scoped.property.findUnique({ where: { id: input.id } });
  if (!existing || existing.deletedAt) throw new PropertyNotFoundError(input.id);
  try {
    return await scoped.property.update({
      where: { id: input.id },
      data: {
        code: input.code,
        title: input.title,
        addressLine: input.addressLine,
        city: input.city,
        totalPriceKobo: input.totalPriceKobo,
      },
    });
  } catch (err) {
    if (isUniqueConstraintError(err)) throw new PropertyCodeConflictError(input.code);
    throw err;
  }
}

export async function setPropertyStatus(
  prisma: PrismaClient,
  ctx: TenantContext,
  input: { id: string; status: PropertyStatusInput },
) {
  const scoped = forTenant(prisma, ctx.tenantId);
  const existing = await scoped.property.findUnique({
    where: { id: input.id },
    include: {
      plans: {
        where: { status: { in: ['ACTIVE', 'DRAFT', 'COMPLETED', 'DEFAULTED'] }, deletedAt: null },
        select: { id: true },
      },
    },
  });
  if (!existing || existing.deletedAt) throw new PropertyNotFoundError(input.id);
  if (existing.status === 'SOLD') {
    throw new PropertyStatusChangeBlockedError(
      input.id,
      'property is SOLD; manual status changes are blocked once a plan is ACTIVE',
    );
  }
  if (existing.plans.length > 0 && input.status !== existing.status) {
    throw new PropertyStatusChangeBlockedError(
      input.id,
      'a non-cancelled plan references this property',
    );
  }
  return scoped.property.update({
    where: { id: input.id },
    data: { status: input.status },
  });
}

export async function softDeleteProperty(
  prisma: PrismaClient,
  ctx: TenantContext,
  id: string,
) {
  const scoped = forTenant(prisma, ctx.tenantId);
  const existing = await scoped.property.findUnique({
    where: { id },
    include: {
      plans: {
        where: { status: { not: 'CANCELLED' }, deletedAt: null },
        select: { id: true },
      },
    },
  });
  if (!existing || existing.deletedAt) throw new PropertyNotFoundError(id);
  if (existing.plans.length > 0) {
    throw new PropertyHasPlansError(id, existing.plans.length);
  }
  return scoped.property.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
}

export async function listProperties(
  prisma: PrismaClient,
  ctx: TenantContext,
  opts: {
    status?: 'AVAILABLE' | 'RESERVED' | 'SOLD';
    search?: string;
    take?: number;
    cursor?: string;
  } = {},
) {
  const scoped = forTenant(prisma, ctx.tenantId);
  const search = opts.search?.trim();
  return scoped.property.findMany({
    where: {
      deletedAt: null,
      ...(opts.status ? { status: opts.status } : {}),
      ...(search
        ? {
            OR: [
              { code: { contains: search.toUpperCase() } },
              { title: { contains: search, mode: 'insensitive' } },
              { addressLine: { contains: search, mode: 'insensitive' } },
              { city: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    },
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    take: opts.take ?? 50,
    ...(opts.cursor ? { skip: 1, cursor: { id: opts.cursor } } : {}),
  });
}

export async function getProperty(
  prisma: PrismaClient,
  ctx: TenantContext,
  id: string,
) {
  const scoped = forTenant(prisma, ctx.tenantId);
  const row = await scoped.property.findUnique({
    where: { id },
    include: {
      plans: {
        where: { deletedAt: null },
        select: { id: true, status: true, totalPriceKobo: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
      },
    },
  });
  if (!row || row.deletedAt) return null;
  return row;
}
```

Modify `packages/db/src/index.ts` — append:

```ts
export {
  createProperty,
  updateProperty,
  setPropertyStatus,
  softDeleteProperty,
  listProperties,
  getProperty,
  PropertyNotFoundError,
  PropertyCodeConflictError,
  PropertyStatusChangeBlockedError,
  PropertyHasPlansError,
} from './properties-service.js';
```

- [ ] **Step 5.2: Typecheck**

```bash
pnpm --filter @solutio/db typecheck
```

Expected: PASS.

- [ ] **Step 5.3: Commit**

```bash
git add packages/db/src/properties-service.ts packages/db/src/index.ts
git commit -m "feat(db/properties): create/update/status/soft-delete/list service"
```

---

## Task 6: Property service integration tests

**Files:**
- Create: `packages/db/__tests__/properties-service.integration.test.ts`

- [ ] **Step 6.1: Write the failing test**

Create `packages/db/__tests__/properties-service.integration.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { startPostgres, type TestPostgres } from './_helpers/postgres.js';
import {
  createProperty,
  updateProperty,
  setPropertyStatus,
  softDeleteProperty,
  listProperties,
  getProperty,
  PropertyCodeConflictError,
  PropertyHasPlansError,
  PropertyStatusChangeBlockedError,
} from '../src/properties-service.js';
import type { TenantContext } from '@solutio/shared/tenant';

let pg: TestPostgres;
const TENANT_A = '01935b7e-0000-7000-8000-000000000011';
const TENANT_B = '01935b7e-0000-7000-8000-000000000012';

const ctxFor = (tenantId: string): TenantContext => ({
  tenantId,
  user: {
    id: '01935b7e-0000-7000-8000-aaaaaaaaaaaa',
    authUserId: '01935b7e-0000-7000-8000-bbbbbbbbbbbb',
    role: 'OWNER',
    email: 'owner@test',
    mustChangePassword: false,
  },
});

beforeAll(async () => {
  pg = await startPostgres();
  await pg.prisma.tenant.createMany({
    data: [
      { id: TENANT_A, slug: 't-a', name: 'A' },
      { id: TENANT_B, slug: 't-b', name: 'B' },
    ],
  });
}, 60_000);

afterAll(async () => {
  await pg?.stop();
});

describe('properties-service', () => {
  test('createProperty stores totalPriceKobo as BigInt and injects tenantId', async () => {
    const ctx = ctxFor(TENANT_A);
    const created = await createProperty(pg.prisma, ctx, {
      code: 'AT-001',
      title: '3-bed terrace',
      addressLine: '12 Marina Road',
      city: 'Lagos',
      totalPriceKobo: 5_000_000_000_00n,
    });
    expect(created.tenantId).toBe(TENANT_A);
    expect(created.status).toBe('AVAILABLE');
    expect(created.totalPriceKobo).toBe(5_000_000_000_00n);
    expect(created.createdBy).toBe(ctx.user.id);
  });

  test('duplicate code within tenant throws PropertyCodeConflictError', async () => {
    const ctx = ctxFor(TENANT_A);
    await createProperty(pg.prisma, ctx, {
      code: 'AT-DUP',
      title: 'X',
      addressLine: 'X',
      city: 'X',
      totalPriceKobo: 1_000_00n,
    });
    await expect(
      createProperty(pg.prisma, ctx, {
        code: 'AT-DUP',
        title: 'Y',
        addressLine: 'Y',
        city: 'Y',
        totalPriceKobo: 2_000_00n,
      }),
    ).rejects.toBeInstanceOf(PropertyCodeConflictError);
  });

  test('same code in different tenant is allowed', async () => {
    const ctxA = ctxFor(TENANT_A);
    const ctxB = ctxFor(TENANT_B);
    await createProperty(pg.prisma, ctxA, {
      code: 'CROSS-OK',
      title: 'X',
      addressLine: 'X',
      city: 'X',
      totalPriceKobo: 1_000_00n,
    });
    const inB = await createProperty(pg.prisma, ctxB, {
      code: 'CROSS-OK',
      title: 'Y',
      addressLine: 'Y',
      city: 'Y',
      totalPriceKobo: 2_000_00n,
    });
    expect(inB.tenantId).toBe(TENANT_B);
  });

  test('setPropertyStatus toggles AVAILABLE ↔ RESERVED when no plans reference it', async () => {
    const ctx = ctxFor(TENANT_A);
    const p = await createProperty(pg.prisma, ctx, {
      code: 'AT-STATUS',
      title: 'X',
      addressLine: 'X',
      city: 'X',
      totalPriceKobo: 1_000_00n,
    });
    const reserved = await setPropertyStatus(pg.prisma, ctx, { id: p.id, status: 'RESERVED' });
    expect(reserved.status).toBe('RESERVED');
    const available = await setPropertyStatus(pg.prisma, ctx, { id: p.id, status: 'AVAILABLE' });
    expect(available.status).toBe('AVAILABLE');
  });

  test('setPropertyStatus blocks when a non-cancelled plan references the property', async () => {
    const ctx = ctxFor(TENANT_A);
    const property = await createProperty(pg.prisma, ctx, {
      code: 'AT-BLOCK',
      title: 'X',
      addressLine: 'X',
      city: 'X',
      totalPriceKobo: 1_000_00n,
    });
    const customer = await pg.prisma.customer.create({
      data: { tenantId: TENANT_A, fullName: 'C', phone: '+2348010000001' },
    });
    await pg.prisma.plan.create({
      data: {
        tenantId: TENANT_A,
        customerId: customer.id,
        propertyId: property.id,
        totalPriceKobo: 1_000_00n,
        depositKobo: 0n,
        monthlyKobo: 1_000_00n,
        termMonths: 1,
        startDate: new Date('2026-06-01'),
        status: 'DRAFT',
      },
    });
    await expect(
      setPropertyStatus(pg.prisma, ctx, { id: property.id, status: 'RESERVED' }),
    ).rejects.toBeInstanceOf(PropertyStatusChangeBlockedError);
  });

  test('softDeleteProperty hides from list and blocks when a non-cancelled plan exists', async () => {
    const ctx = ctxFor(TENANT_A);
    const free = await createProperty(pg.prisma, ctx, {
      code: 'AT-DEL-OK',
      title: 'X',
      addressLine: 'X',
      city: 'X',
      totalPriceKobo: 1_000_00n,
    });
    await softDeleteProperty(pg.prisma, ctx, free.id);
    expect(await getProperty(pg.prisma, ctx, free.id)).toBeNull();

    const linked = await createProperty(pg.prisma, ctx, {
      code: 'AT-DEL-BLK',
      title: 'X',
      addressLine: 'X',
      city: 'X',
      totalPriceKobo: 1_000_00n,
    });
    const customer = await pg.prisma.customer.create({
      data: { tenantId: TENANT_A, fullName: 'C2', phone: '+2348010000002' },
    });
    await pg.prisma.plan.create({
      data: {
        tenantId: TENANT_A,
        customerId: customer.id,
        propertyId: linked.id,
        totalPriceKobo: 1_000_00n,
        depositKobo: 0n,
        monthlyKobo: 1_000_00n,
        termMonths: 1,
        startDate: new Date('2026-06-01'),
        status: 'DRAFT',
      },
    });
    await expect(softDeleteProperty(pg.prisma, ctx, linked.id)).rejects.toBeInstanceOf(
      PropertyHasPlansError,
    );
  });

  test('listProperties filters by status', async () => {
    const ctx = ctxFor(TENANT_A);
    const available = await listProperties(pg.prisma, ctx, { status: 'AVAILABLE' });
    expect(available.every((p) => p.status === 'AVAILABLE')).toBe(true);
  });

  test('listProperties cross-tenant isolation', async () => {
    const ctxA = ctxFor(TENANT_A);
    const ctxB = ctxFor(TENANT_B);
    await createProperty(pg.prisma, ctxB, {
      code: 'B-ONLY',
      title: 'X',
      addressLine: 'X',
      city: 'X',
      totalPriceKobo: 1_000_00n,
    });
    const listA = await listProperties(pg.prisma, ctxA);
    expect(listA.some((p) => p.code === 'B-ONLY')).toBe(false);
  });

  test('listProperties EXPLAIN ANALYZE uses the property_active_idx partial index', async () => {
    const ctx = ctxFor(TENANT_A);
    const rows = await pg.prisma.$queryRawUnsafe<Array<{ 'QUERY PLAN': string }>>(
      `EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
       SELECT * FROM public."Property"
       WHERE "tenantId" = '${TENANT_A}'::uuid AND "deletedAt" IS NULL
       ORDER BY "status" ASC, "createdAt" DESC
       LIMIT 50`,
    );
    const plan = rows.map((r) => r['QUERY PLAN']).join('\n');
    expect(plan).toContain('property_active_idx');
    // Reference ctx so lint does not flag the unused binding.
    expect(ctx.tenantId).toBe(TENANT_A);
  });
});
```

- [ ] **Step 6.2: Run the test**

```bash
pnpm --filter @solutio/db test:integration
```

Expected: PASS. If the EXPLAIN ANALYZE assertion fails because the planner picked a sequential scan (small table), force the planner with `SET LOCAL enable_seqscan = off;` before the EXPLAIN — but try without the hint first.

- [ ] **Step 6.3: Commit**

```bash
git add packages/db/__tests__/properties-service.integration.test.ts
git commit -m "test(db/properties): integration coverage incl. partial-index EXPLAIN"
```

---

## Task 7: Customer server actions

**Files:**
- Create: `apps/web/server-actions/customers/create.ts`
- Create: `apps/web/server-actions/customers/update.ts`
- Create: `apps/web/server-actions/customers/soft-delete.ts`

- [ ] **Step 7.1: Implement create**

Create `apps/web/server-actions/customers/create.ts`:

```ts
'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { customerCreateSchema } from '@solutio/shared/customers';
import { prisma } from '@solutio/db/client';
import { createCustomer } from '@solutio/db';
import { getTenantContext } from '@/lib/tenant-context';
import { requireRole } from '@solutio/shared/tenant';

export type CustomerActionState =
  | { ok: true; data: { id: string } }
  | { ok: false; message: string; fieldErrors?: Record<string, string> };

function flattenZod(err: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of err.issues) {
    const path = issue.path.join('.');
    if (!out[path]) out[path] = issue.message;
  }
  return out;
}

export async function createCustomerAction(
  _prev: CustomerActionState | null,
  formData: FormData,
): Promise<CustomerActionState> {
  const ctx = await getTenantContext();
  if (!ctx) return { ok: false, message: 'Not signed in' };
  requireRole(ctx, ['OWNER', 'ADMIN', 'STAFF']);

  const parsed = customerCreateSchema.safeParse({
    fullName: formData.get('fullName'),
    phone: formData.get('phone'),
    email: formData.get('email') ?? undefined,
    nationalId: formData.get('nationalId') ?? undefined,
    notes: formData.get('notes') ?? undefined,
  });
  if (!parsed.success) {
    return { ok: false, message: 'Please fix the highlighted fields', fieldErrors: flattenZod(parsed.error) };
  }

  const created = await createCustomer(prisma, ctx, parsed.data);
  revalidatePath('/customers');
  return { ok: true, data: { id: created.id } };
}
```

- [ ] **Step 7.2: Implement update**

Create `apps/web/server-actions/customers/update.ts`:

```ts
'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { customerUpdateSchema } from '@solutio/shared/customers';
import { prisma } from '@solutio/db/client';
import { updateCustomer, CustomerNotFoundError } from '@solutio/db';
import { getTenantContext } from '@/lib/tenant-context';
import { requireRole } from '@solutio/shared/tenant';
import type { CustomerActionState } from './create';

function flattenZod(err: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of err.issues) {
    const path = issue.path.join('.');
    if (!out[path]) out[path] = issue.message;
  }
  return out;
}

export async function updateCustomerAction(
  _prev: CustomerActionState | null,
  formData: FormData,
): Promise<CustomerActionState> {
  const ctx = await getTenantContext();
  if (!ctx) return { ok: false, message: 'Not signed in' };
  requireRole(ctx, ['OWNER', 'ADMIN', 'STAFF']);

  const parsed = customerUpdateSchema.safeParse({
    id: formData.get('id'),
    fullName: formData.get('fullName'),
    phone: formData.get('phone'),
    email: formData.get('email') ?? undefined,
    nationalId: formData.get('nationalId') ?? undefined,
    notes: formData.get('notes') ?? undefined,
  });
  if (!parsed.success) {
    return { ok: false, message: 'Please fix the highlighted fields', fieldErrors: flattenZod(parsed.error) };
  }

  try {
    const updated = await updateCustomer(prisma, ctx, parsed.data);
    revalidatePath('/customers');
    revalidatePath(`/customers/${updated.id}`);
    return { ok: true, data: { id: updated.id } };
  } catch (err) {
    if (err instanceof CustomerNotFoundError) {
      return { ok: false, message: 'Customer not found' };
    }
    throw err;
  }
}
```

- [ ] **Step 7.3: Implement soft-delete**

Create `apps/web/server-actions/customers/soft-delete.ts`:

```ts
'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { prisma } from '@solutio/db/client';
import { softDeleteCustomer, CustomerHasPlansError, CustomerNotFoundError } from '@solutio/db';
import { getTenantContext } from '@/lib/tenant-context';
import { requireRole } from '@solutio/shared/tenant';

export type SoftDeleteState = { ok: true } | { ok: false; message: string };

const idSchema = z.object({ id: z.string().uuid() });

export async function softDeleteCustomerAction(
  _prev: SoftDeleteState | null,
  formData: FormData,
): Promise<SoftDeleteState> {
  const ctx = await getTenantContext();
  if (!ctx) return { ok: false, message: 'Not signed in' };
  requireRole(ctx, ['OWNER', 'ADMIN']);

  const parsed = idSchema.safeParse({ id: formData.get('id') });
  if (!parsed.success) return { ok: false, message: 'Invalid id' };

  try {
    await softDeleteCustomer(prisma, ctx, parsed.data.id);
    revalidatePath('/customers');
    return { ok: true };
  } catch (err) {
    if (err instanceof CustomerHasPlansError) {
      return {
        ok: false,
        message: 'This customer has active plans. Cancel them before deleting.',
      };
    }
    if (err instanceof CustomerNotFoundError) {
      return { ok: false, message: 'Customer not found' };
    }
    throw err;
  }
}
```

- [ ] **Step 7.4: Typecheck**

```bash
pnpm --filter @solutio/web typecheck 2>&1 | tail -20
```

Expected: PASS.

- [ ] **Step 7.5: Commit**

```bash
git add apps/web/server-actions/customers
git commit -m "feat(web/customers): create/update/soft-delete server actions"
```

---

## Task 8: Property server actions

**Files:**
- Create: `apps/web/server-actions/properties/create.ts`
- Create: `apps/web/server-actions/properties/update.ts`
- Create: `apps/web/server-actions/properties/set-status.ts`
- Create: `apps/web/server-actions/properties/soft-delete.ts`

- [ ] **Step 8.1: Implement create + update**

Create `apps/web/server-actions/properties/create.ts`:

```ts
'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { propertyCreateSchema } from '@solutio/shared/properties';
import { prisma } from '@solutio/db/client';
import { createProperty, PropertyCodeConflictError } from '@solutio/db';
import { getTenantContext } from '@/lib/tenant-context';
import { requireRole } from '@solutio/shared/tenant';

export type PropertyActionState =
  | { ok: true; data: { id: string } }
  | { ok: false; message: string; fieldErrors?: Record<string, string> };

function flattenZod(err: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of err.issues) {
    const path = issue.path.join('.');
    if (!out[path]) out[path] = issue.message;
  }
  return out;
}

export async function createPropertyAction(
  _prev: PropertyActionState | null,
  formData: FormData,
): Promise<PropertyActionState> {
  const ctx = await getTenantContext();
  if (!ctx) return { ok: false, message: 'Not signed in' };
  requireRole(ctx, ['OWNER', 'ADMIN', 'STAFF']);

  const parsed = propertyCreateSchema.safeParse({
    code: formData.get('code'),
    title: formData.get('title'),
    addressLine: formData.get('addressLine'),
    city: formData.get('city'),
    totalPriceNgn: formData.get('totalPriceNgn'),
  });
  if (!parsed.success) {
    return { ok: false, message: 'Please fix the highlighted fields', fieldErrors: flattenZod(parsed.error) };
  }

  try {
    const created = await createProperty(prisma, ctx, parsed.data);
    revalidatePath('/properties');
    return { ok: true, data: { id: created.id } };
  } catch (err) {
    if (err instanceof PropertyCodeConflictError) {
      return { ok: false, message: 'Property code already in use', fieldErrors: { code: 'Already in use' } };
    }
    throw err;
  }
}
```

Create `apps/web/server-actions/properties/update.ts` — same shape, importing `propertyUpdateSchema` and `updateProperty`, reading `id` from FormData; on success `revalidatePath('/properties')` AND `revalidatePath('/properties/' + updated.id)`. Handle `PropertyNotFoundError` → `{ ok: false, message: 'Property not found' }`.

- [ ] **Step 8.2: Implement set-status**

Create `apps/web/server-actions/properties/set-status.ts`:

```ts
'use server';

import { revalidatePath } from 'next/cache';
import { propertySetStatusSchema } from '@solutio/shared/properties';
import { prisma } from '@solutio/db/client';
import {
  setPropertyStatus,
  PropertyNotFoundError,
  PropertyStatusChangeBlockedError,
} from '@solutio/db';
import { getTenantContext } from '@/lib/tenant-context';
import { requireRole } from '@solutio/shared/tenant';

export type SetStatusState = { ok: true } | { ok: false; message: string };

export async function setPropertyStatusAction(
  _prev: SetStatusState | null,
  formData: FormData,
): Promise<SetStatusState> {
  const ctx = await getTenantContext();
  if (!ctx) return { ok: false, message: 'Not signed in' };
  requireRole(ctx, ['OWNER', 'ADMIN']);

  const parsed = propertySetStatusSchema.safeParse({
    id: formData.get('id'),
    status: formData.get('status'),
  });
  if (!parsed.success) return { ok: false, message: 'Invalid input' };

  try {
    await setPropertyStatus(prisma, ctx, parsed.data);
    revalidatePath('/properties');
    revalidatePath(`/properties/${parsed.data.id}`);
    return { ok: true };
  } catch (err) {
    if (err instanceof PropertyNotFoundError) return { ok: false, message: 'Property not found' };
    if (err instanceof PropertyStatusChangeBlockedError) return { ok: false, message: err.message };
    throw err;
  }
}
```

- [ ] **Step 8.3: Implement soft-delete**

Mirror `apps/web/server-actions/customers/soft-delete.ts`, calling `softDeleteProperty`, mapping `PropertyHasPlansError` → user-friendly message.

- [ ] **Step 8.4: Typecheck**

```bash
pnpm --filter @solutio/web typecheck 2>&1 | tail -20
```

- [ ] **Step 8.5: Commit**

```bash
git add apps/web/server-actions/properties
git commit -m "feat(web/properties): create/update/status/soft-delete server actions"
```

---

## Task 9: Customer form + create dialog (client components + unit tests)

**Files:**
- Create: `apps/web/components/customers/customer-form.tsx`
- Create: `apps/web/components/customers/customer-create-dialog.tsx`
- Create: `apps/web/components/__tests__/customer-form.test.tsx`

- [ ] **Step 9.1: Write the failing test**

Create `apps/web/components/__tests__/customer-form.test.tsx`:

```tsx
import { describe, expect, test, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CustomerForm } from '../customers/customer-form';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

describe('CustomerForm', () => {
  test('renders Full name and Phone as required fields', () => {
    render(<CustomerForm mode="create" onSubmit={vi.fn()} />);
    expect(screen.getByLabelText(/full name/i)).toBeRequired();
    expect(screen.getByLabelText(/phone/i)).toBeRequired();
  });

  test('shows the inline-friendly variant when variant=inline', () => {
    render(<CustomerForm mode="create" onSubmit={vi.fn()} variant="inline" />);
    // Inline variant omits "Cancel" link in favour of caller-supplied controls.
    expect(screen.queryByRole('link', { name: /cancel/i })).toBeNull();
  });

  test('blocks submit and shows field errors when fullName is empty', async () => {
    const onSubmit = vi.fn();
    render(<CustomerForm mode="create" onSubmit={onSubmit} />);
    await userEvent.click(screen.getByRole('button', { name: /save/i }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(await screen.findByText(/required/i)).toBeInTheDocument();
  });

  test('submits typed values when valid', async () => {
    const onSubmit = vi.fn().mockResolvedValue({ ok: true, data: { id: 'x' } });
    render(<CustomerForm mode="create" onSubmit={onSubmit} />);
    await userEvent.type(screen.getByLabelText(/full name/i), 'Adaeze Okafor');
    await userEvent.type(screen.getByLabelText(/phone/i), '+2348012345001');
    await userEvent.click(screen.getByRole('button', { name: /save/i }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    const arg = onSubmit.mock.calls[0]![0] as FormData;
    expect(arg.get('fullName')).toBe('Adaeze Okafor');
    expect(arg.get('phone')).toBe('+2348012345001');
  });
});
```

- [ ] **Step 9.2: Implement CustomerForm**

Create `apps/web/components/customers/customer-form.tsx`. The form must:
- Be a `"use client"` component.
- Use `useForm` from `react-hook-form` with `zodResolver(customerCreateSchema)` for create, `zodResolver(customerUpdateSchema)` for edit (pass `mode` prop).
- Render fields: `fullName` (required text), `phone` (required text, `inputMode="tel"`), `email` (optional), `nationalId` (optional), `notes` (textarea, optional).
- Accept `onSubmit: (data: FormData) => Promise<CustomerActionState>` — the page wires the real server action; the test passes a spy.
- Accept `variant?: 'inline' | 'page'`; in `'page'` mode include a "Cancel" `<Link>` back to `/customers`; in `'inline'` mode omit it (caller renders dialog controls).
- Render `fieldErrors` from the action response under each input via shadcn `FormMessage`-style markup (or simple `<p className="text-sm text-red-600">`).
- On success in `'page'` mode, `router.push('/customers')` and `router.refresh()`.

Use shadcn primitives already in the repo: `Input`, `Label`, `Button`. Use `Form`, `FormField`, etc. from `components/ui/form.tsx` if convenient — but plain markup is acceptable.

- [ ] **Step 9.3: Implement CustomerCreateDialog**

Create `apps/web/components/customers/customer-create-dialog.tsx`. The dialog must:
- Be a `"use client"` component.
- Expose props `{ trigger: React.ReactNode; onCreated?: (id: string) => void }`.
- Wrap `Dialog`/`DialogContent`/`DialogTrigger` from `components/ui/dialog.tsx`.
- Internally call `createCustomerAction` via `useFormState`/`useTransition` (Next 16 form action pattern). On `ok: true`, close the dialog and call `onCreated(id)`.
- Render `<CustomerForm mode="create" variant="inline" onSubmit={…wrap action…} />`.

This dialog is the M3 "Pick existing customer OR + New customer" component, so signature matters — keep `onCreated(id)` exactly as specified.

- [ ] **Step 9.4: Run tests**

```bash
pnpm --filter @solutio/web test
```

Expected: PASS for new customer-form tests; existing site-nav test continues to pass.

- [ ] **Step 9.5: Commit**

```bash
git add apps/web/components/customers apps/web/components/__tests__/customer-form.test.tsx
git commit -m "feat(web/customers): form + create dialog with rhf+zod resolver"
```

---

## Task 10: Property form + create dialog (client components + unit tests)

**Files:**
- Create: `apps/web/components/properties/property-form.tsx`
- Create: `apps/web/components/properties/property-create-dialog.tsx`
- Create: `apps/web/components/__tests__/property-form.test.tsx`

- [ ] **Step 10.1: Write the failing test**

Create `apps/web/components/__tests__/property-form.test.tsx`:

```tsx
import { describe, expect, test, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PropertyForm } from '../properties/property-form';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

describe('PropertyForm', () => {
  test('renders all five required fields', () => {
    render(<PropertyForm mode="create" onSubmit={vi.fn()} />);
    expect(screen.getByLabelText(/code/i)).toBeRequired();
    expect(screen.getByLabelText(/title/i)).toBeRequired();
    expect(screen.getByLabelText(/address/i)).toBeRequired();
    expect(screen.getByLabelText(/city/i)).toBeRequired();
    expect(screen.getByLabelText(/total price/i)).toBeRequired();
  });

  test('submits FormData with uppercased code', async () => {
    const onSubmit = vi.fn().mockResolvedValue({ ok: true, data: { id: 'p1' } });
    render(<PropertyForm mode="create" onSubmit={onSubmit} />);
    await userEvent.type(screen.getByLabelText(/code/i), 'at-001');
    await userEvent.type(screen.getByLabelText(/title/i), '3-bed terrace');
    await userEvent.type(screen.getByLabelText(/address/i), '12 Marina Road');
    await userEvent.type(screen.getByLabelText(/city/i), 'Lagos');
    await userEvent.type(screen.getByLabelText(/total price/i), '50,000,000');
    await userEvent.click(screen.getByRole('button', { name: /save/i }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    const arg = onSubmit.mock.calls[0]![0] as FormData;
    // The form passes raw input as typed; the server schema does the uppercase + kobo conversion.
    expect(arg.get('code')).toBe('at-001');
    expect(arg.get('totalPriceNgn')).toBe('50,000,000');
  });

  test('shows fieldErrors returned from the action', async () => {
    const onSubmit = vi.fn().mockResolvedValue({
      ok: false,
      message: 'Please fix the highlighted fields',
      fieldErrors: { code: 'Already in use' },
    });
    render(<PropertyForm mode="create" onSubmit={onSubmit} />);
    await userEvent.type(screen.getByLabelText(/code/i), 'AT-DUP');
    await userEvent.type(screen.getByLabelText(/title/i), 'X');
    await userEvent.type(screen.getByLabelText(/address/i), 'X');
    await userEvent.type(screen.getByLabelText(/city/i), 'X');
    await userEvent.type(screen.getByLabelText(/total price/i), '1,000');
    await userEvent.click(screen.getByRole('button', { name: /save/i }));
    expect(await screen.findByText(/already in use/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 10.2: Implement PropertyForm**

Same conventions as `CustomerForm`. Fields: `code`, `title`, `addressLine` (label: "Address"), `city`, `totalPriceNgn` (label: "Total price (NGN)", `inputMode="decimal"`). The form does NOT do its own kobo conversion — it sends the raw string to the server action; the schema handles it.

For edit mode, accept an `initial: PropertyDetail` prop and seed defaults including `totalPriceNgn = formatKobo(initial.totalPriceKobo, { withSymbol: false })` (use `@solutio/shared/money`'s helpers; if `withSymbol` is not supported, strip the symbol with a small helper inside the form).

- [ ] **Step 10.3: Implement PropertyCreateDialog**

Mirror `CustomerCreateDialog`.

- [ ] **Step 10.4: Run tests**

```bash
pnpm --filter @solutio/web test
```

- [ ] **Step 10.5: Commit**

```bash
git add apps/web/components/properties apps/web/components/__tests__/property-form.test.tsx
git commit -m "feat(web/properties): form + create dialog"
```

---

## Task 11: Customer pages (list / new / detail / edit)

**Files:**
- Create: `apps/web/app/(authenticated)/customers/page.tsx`
- Create: `apps/web/app/(authenticated)/customers/new/page.tsx`
- Create: `apps/web/app/(authenticated)/customers/[id]/page.tsx`
- Create: `apps/web/app/(authenticated)/customers/[id]/edit/page.tsx`

- [ ] **Step 11.1: List page**

Create `apps/web/app/(authenticated)/customers/page.tsx`:

```tsx
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTenantContext } from '@/lib/tenant-context';
import { prisma } from '@solutio/db/client';
import { listCustomers } from '@solutio/db';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

export const dynamic = 'force-dynamic';

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const ctx = await getTenantContext();
  if (!ctx) redirect('/login');
  const { q } = await searchParams;
  const customers = await listCustomers(prisma, ctx, { search: q });

  return (
    <section className="space-y-4">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Customers</h1>
        <Button asChild>
          <Link href="/customers/new">New customer</Link>
        </Button>
      </header>
      <form className="flex gap-2">
        <input
          type="search"
          name="q"
          defaultValue={q ?? ''}
          placeholder="Search name, phone, email"
          className="w-64 rounded border border-slate-300 px-3 py-1.5 text-sm"
        />
        <Button type="submit" variant="secondary">Search</Button>
      </form>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Phone</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Created</TableHead>
            <TableHead className="w-24" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {customers.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="text-center text-sm text-slate-500">
                No customers yet.
              </TableCell>
            </TableRow>
          ) : (
            customers.map((c) => (
              <TableRow key={c.id}>
                <TableCell>
                  <Link href={`/customers/${c.id}`} className="text-slate-900 hover:underline">
                    {c.fullName}
                  </Link>
                </TableCell>
                <TableCell>{c.phone}</TableCell>
                <TableCell>{c.email ?? '—'}</TableCell>
                <TableCell>{c.createdAt.toISOString().slice(0, 10)}</TableCell>
                <TableCell className="text-right">
                  <Link href={`/customers/${c.id}/edit`} className="text-sm text-slate-600 hover:underline">
                    Edit
                  </Link>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </section>
  );
}
```

- [ ] **Step 11.2: New page**

Create `apps/web/app/(authenticated)/customers/new/page.tsx`:

```tsx
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getTenantContext } from '@/lib/tenant-context';
import { CustomerForm } from '@/components/customers/customer-form';
import { createCustomerAction } from '@/server-actions/customers/create';

export const dynamic = 'force-dynamic';

export default async function NewCustomerPage() {
  const ctx = await getTenantContext();
  if (!ctx) redirect('/login');

  return (
    <section className="max-w-xl space-y-4">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">New customer</h1>
        <Link href="/customers" className="text-sm text-slate-600 hover:underline">Cancel</Link>
      </header>
      <CustomerForm mode="create" variant="page" onSubmit={createCustomerAction} />
    </section>
  );
}
```

- [ ] **Step 11.3: Detail page (with soft-delete control)**

Create `apps/web/app/(authenticated)/customers/[id]/page.tsx`. The page must:
- Resolve `params.id`, call `getCustomer(prisma, ctx, id)`. If null → `notFound()`.
- Render Full name, Phone, Email, National ID, Notes (all "—" when null).
- Render a "Plans" section listing `customer.plans` (id, status, totalPriceKobo formatted via `formatKobo`) — links to `/plans/[id]` placeholder (M3 will fill those routes; no link if `customer.plans.length === 0`).
- Render a "Delete customer" form wired to `softDeleteCustomerAction` via `useFormState` (this requires a client wrapper — create `apps/web/components/customers/customer-delete-button.tsx` as a small `"use client"` component that shows a `confirm()` dialog and toasts success/error).
- Render an "Edit" link to `/customers/[id]/edit`.

- [ ] **Step 11.4: Edit page**

Create `apps/web/app/(authenticated)/customers/[id]/edit/page.tsx`. Resolve params, fetch the customer, render `<CustomerForm mode="edit" variant="page" initial={customer} onSubmit={updateCustomerAction} />`.

- [ ] **Step 11.5: Verify build**

```bash
pnpm --filter @solutio/web build 2>&1 | tail -20
```

Expected: build succeeds (Next 16 RSC with Server Actions).

- [ ] **Step 11.6: Commit**

```bash
git add apps/web/app/\(authenticated\)/customers apps/web/components/customers/customer-delete-button.tsx
git commit -m "feat(web/customers): list/new/detail/edit pages + delete control"
```

---

## Task 12: Property pages (list / new / detail / edit)

**Files:**
- Create: `apps/web/app/(authenticated)/properties/page.tsx`
- Create: `apps/web/app/(authenticated)/properties/new/page.tsx`
- Create: `apps/web/app/(authenticated)/properties/[id]/page.tsx`
- Create: `apps/web/app/(authenticated)/properties/[id]/edit/page.tsx`
- Create: `apps/web/components/properties/property-status-control.tsx`
- Create: `apps/web/components/properties/property-delete-button.tsx`

- [ ] **Step 12.1: List page**

Mirror `customers/page.tsx`:
- Title "Properties", "New property" button.
- Filter form with `status` select (All / AVAILABLE / RESERVED / SOLD) and free-text `q`.
- Table columns: Code (link to detail), Title, City, Total price (`formatKobo(p.totalPriceKobo)`), Status (rendered via `<Badge variant=…>` — AVAILABLE → green-ish, RESERVED → yellow, SOLD → slate), Created, Edit link.
- Status badge variant mapping: AVAILABLE→`default`, RESERVED→`secondary`, SOLD→`outline`. Use the existing `Badge` component.

- [ ] **Step 12.2: New + Edit pages**

Same shape as customers: page wraps `PropertyForm`. Edit fetches `getProperty`, seeds initial values, calls `updatePropertyAction`.

- [ ] **Step 12.3: Detail page**

Render code, title, address, city, total price, status. Show status control:

`apps/web/components/properties/property-status-control.tsx` — a `"use client"` component that accepts `{ id: string; status: 'AVAILABLE' | 'RESERVED' | 'SOLD'; canChange: boolean }`. If `status === 'SOLD'`, render the badge only, with a small note "Set automatically when a plan goes ACTIVE." Otherwise show a small `<Select>` (shadcn) with options AVAILABLE/RESERVED and a "Save" button bound to `setPropertyStatusAction`. The page passes `canChange = property.plans.every((p) => p.status === 'CANCELLED')`.

Render a "Plans" section listing the property's plans (same shape as on the customer detail).

Render a "Delete property" button wired to `softDeletePropertyAction` via `apps/web/components/properties/property-delete-button.tsx`.

- [ ] **Step 12.4: Verify build**

```bash
pnpm --filter @solutio/web build 2>&1 | tail -20
```

- [ ] **Step 12.5: Commit**

```bash
git add apps/web/app/\(authenticated\)/properties apps/web/components/properties
git commit -m "feat(web/properties): list/new/detail/edit pages + status/delete controls"
```

---

## Task 13: Home page link cards

**Files:**
- Modify: `apps/web/app/(authenticated)/page.tsx`

- [ ] **Step 13.1: Replace placeholder paragraph with link cards**

Read the file first. Replace the "Phase 0 is a foundation deploy…" paragraph with a small grid (two cards) linking to `/customers` and `/properties`. Each card shows the count from a quick `listCustomers(prisma, ctx, { take: 1 })` / `listProperties` call — or skip counts if it slows the page down; a static label is acceptable.

Do NOT remove the welcome heading or the sign-out form.

- [ ] **Step 13.2: Commit**

```bash
git add apps/web/app/\(authenticated\)/page.tsx
git commit -m "feat(web/home): link cards to customers and properties"
```

---

## Task 14: E2E happy path

**Files:**
- Create: `apps/web/e2e/m2-customer-property.e2e.ts`

- [ ] **Step 14.1: Write the test**

Create `apps/web/e2e/m2-customer-property.e2e.ts`. Read `apps/web/e2e/happy-path.e2e.ts` and `apps/web/e2e/run-e2e.ts` first to understand how the harness boots a fresh container, runs migrations, and seeds the OWNER. The new test must:

1. Sign in as the seeded OWNER (reuse the happy-path login + change-password flow as a precondition — either by extracting a `beforeEach` helper into `e2e/_helpers/login.ts` or by inlining the steps).
2. Navigate to `/customers`. Click "New customer". Submit a customer. Assert it appears in the list.
3. Click into the customer detail. Click Edit. Change the phone. Save. Assert the new phone shows on detail.
4. Navigate to `/properties`. Create a property with code `E2E-01`, price `5,000,000`. Assert it appears.
5. Open the property detail. Toggle status AVAILABLE → RESERVED. Assert the badge updates.
6. Delete the customer (it has no plans). Assert it disappears from the list.
7. Delete the property. Assert it disappears.

Use `page.getByRole('link', { name: 'Customers' }).click()` for nav. Use `data-testid` only if a role/text selector is ambiguous.

- [ ] **Step 14.2: Run the E2E locally**

```bash
pnpm --filter @solutio/web e2e 2>&1 | tail -30
```

(If a different command is used in the repo, follow `apps/web/package.json`'s `e2e` script.)

Expected: PASS. If the test is flaky, add `await expect(page.locator(...)).toBeVisible()` checkpoints; never add `waitForTimeout`.

- [ ] **Step 14.3: Commit**

```bash
git add apps/web/e2e/m2-customer-property.e2e.ts apps/web/e2e/_helpers 2>/dev/null
git commit -m "test(web): e2e for M2 customer + property CRUD"
```

---

## Task 15: Full repo test suite + coverage check

**Files:**
- None (verification)

- [ ] **Step 15.1: Run full suite**

```bash
pnpm test
```

Expected: every previously-passing test still passes; new tests pass. Tests added in M2:
- shared/customers schemas
- shared/properties schemas
- db/customers-service integration
- db/properties-service integration
- web/customer-form
- web/property-form

- [ ] **Step 15.2: Coverage spot-check on the new shared schemas**

```bash
pnpm --filter @solutio/shared exec vitest run --coverage \
  src/customers src/properties
```

Expected: ≥95% line coverage on the new schema files (locked by spec acceptance).

If coverage is below 95%, add a test that exercises the missing branch (e.g. trimming, max-length).

- [ ] **Step 15.3: Coverage spot-check on server actions**

```bash
pnpm --filter @solutio/web exec vitest run --coverage \
  server-actions/customers server-actions/properties
```

Expected: ≥80% line coverage. If short, add unit tests in `apps/web/server-actions/__tests__/` that mock the service module with `vi.mock('@solutio/db', ...)` and assert the action's response shape per error class.

- [ ] **Step 15.4: Typecheck the whole repo**

```bash
pnpm -r typecheck 2>&1 | tail -20
```

Expected: zero errors.

- [ ] **Step 15.5: Commit any coverage-driven additions**

If steps 15.2 or 15.3 added tests:

```bash
git add .
git commit -m "test: backfill coverage to hit M2 thresholds"
```

---

## Task 16: Open the PR

**Files:**
- None

- [ ] **Step 16.1: Push the branch**

```bash
git push -u origin worktree-phase-1a-m2-customer-property
```

- [ ] **Step 16.2: Open the PR**

```bash
gh pr create --base main --title "feat(M2): customer & property CRUD" --body "$(cat <<'EOF'
## Summary
- Customer CRUD: list/new/detail/edit/soft-delete pages, server actions, service layer, Zod schemas, reusable create dialog for M3.
- Property CRUD: same shape + status toggle (AVAILABLE↔RESERVED in M2; SOLD is M3's auto-flip), partial-index list query confirmed via EXPLAIN ANALYZE.
- Shared Zod schemas under `@solutio/shared/{customers,properties}`. Service functions under `@solutio/db` (Prisma + ctx as explicit params).
- Home page links to the two new sections.
- E2E lane covering the full customer + property happy path.

## Test plan
- [ ] `pnpm test` green (unit + db integration + web component)
- [ ] `pnpm --filter @solutio/web e2e` green
- [ ] Coverage: ≥95% on shared schemas, ≥80% on server actions
- [ ] EXPLAIN ANALYZE shows partial-index usage on properties list
- [ ] Manual: log in, create/edit/delete a customer; create/edit/status-toggle/delete a property; soft-deleted rows disappear from lists

## Spec
`docs/superpowers/specs/2026-05-15-phase-1a-product-ui-design.md` §M2 (lines 219–230).
EOF
)"
```

- [ ] **Step 16.3: Watch checks**

```bash
gh pr checks --watch
```

Expected: all required checks (build, lint, unit, integration, e2e) go green. If a check fails, fix and push — do not merge until green.

---

## Self-review checklist

Before declaring M2 done, re-read the spec acceptance:

- [ ] Clerk can create, edit, soft-delete a customer; soft-deleted customer disappears from list and from "Pick existing customer" combobox in plan-create — **list disappearance covered by Task 11+14; combobox surfaces in M3 via the dialog component shipped in Task 9.**
- [ ] Same for property — **Task 12 + 14.**
- [ ] Partial-index plans verified in EXPLAIN ANALYZE on the list queries — **Task 6, Step 6.1 final assertion.**
- [ ] Vitest coverage ≥ 80% across server actions; ≥ 95% on shared schemas — **Task 15.**

Beyond acceptance:
- [ ] No barrel-imports of `@solutio/db` from `apps/web`.
- [ ] No service-layer file calls `getTenantContext()` or any ambient resolver.
- [ ] No `next/middleware.ts` added — auth gating stays in `(authenticated)/layout.tsx`.
- [ ] No schema migration committed (M2 ships zero schema changes; if a step forced one, escalate).
- [ ] No new dependencies in `package.json` (shadcn primitives already exist; rhf + resolvers + zod already exist; verify with `git diff main -- '**/package.json'`).
