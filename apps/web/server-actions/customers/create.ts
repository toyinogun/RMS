'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { customerCreateSchema } from '@solutio/shared/customers';
import { prisma } from '@solutio/db/client';
import { createCustomer } from '@solutio/db/customers-service';
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
