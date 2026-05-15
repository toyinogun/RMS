'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { customerUpdateSchema } from '@solutio/shared/customers';
import { prisma } from '@solutio/db/client';
import { updateCustomer, CustomerNotFoundError } from '@solutio/db/customers-service';
import { getTenantContext } from '@/lib/tenant-context';
import { hasRole } from '@solutio/shared/tenant';
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
  if (!hasRole(ctx, ['OWNER', 'ADMIN', 'STAFF'])) return { ok: false, message: 'Forbidden' };

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
