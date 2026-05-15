'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { softDeleteProperty, PropertyHasPlansError, PropertyNotFoundError } from '@solutio/db/properties-service';
import { getTenantContext } from '@/lib/tenant-context';
import { hasRole } from '@solutio/shared/tenant';

export type PropertyDeleteState = { ok: true } | { ok: false; message: string };

const idSchema = z.object({ id: z.string().uuid() });

export async function softDeletePropertyAction(
  _prev: PropertyDeleteState | null,
  formData: FormData,
): Promise<PropertyDeleteState> {
  const ctx = await getTenantContext();
  if (!ctx) return { ok: false, message: 'Not signed in' };
  if (!hasRole(ctx, ['OWNER', 'ADMIN'])) return { ok: false, message: 'Forbidden' };

  const parsed = idSchema.safeParse({ id: formData.get('id') });
  if (!parsed.success) return { ok: false, message: 'Invalid id' };

  try {
    await softDeleteProperty(ctx, parsed.data.id);
    revalidatePath('/properties');
    return { ok: true };
  } catch (err) {
    if (err instanceof PropertyHasPlansError) {
      return {
        ok: false,
        message: 'This property has active plans. Cancel them before deleting.',
      };
    }
    if (err instanceof PropertyNotFoundError) {
      return { ok: false, message: 'Property not found' };
    }
    throw err;
  }
}
