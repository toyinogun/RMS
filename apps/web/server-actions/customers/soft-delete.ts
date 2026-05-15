'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { softDeleteCustomer, CustomerHasPlansError, CustomerNotFoundError } from '@solutio/db/customers-service';
import { getTenantContext } from '@/lib/tenant-context';
import { hasRole } from '@solutio/shared/tenant';

export type SoftDeleteState = { ok: true } | { ok: false; message: string };

const idSchema = z.object({ id: z.string().uuid() });

export async function softDeleteCustomerAction(
  _prev: SoftDeleteState | null,
  formData: FormData,
): Promise<SoftDeleteState> {
  const ctx = await getTenantContext();
  if (!ctx) return { ok: false, message: 'Not signed in' };
  if (!hasRole(ctx, ['OWNER', 'ADMIN'])) return { ok: false, message: 'Forbidden' };

  const parsed = idSchema.safeParse({ id: formData.get('id') });
  if (!parsed.success) return { ok: false, message: 'Invalid id' };

  try {
    await softDeleteCustomer(ctx, parsed.data.id);
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
