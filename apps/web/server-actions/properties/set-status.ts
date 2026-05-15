'use server';

import { revalidatePath } from 'next/cache';
import { propertySetStatusSchema } from '@solutio/shared/properties';
import { prisma } from '@solutio/db/client';
import {
  setPropertyStatus,
  PropertyNotFoundError,
  PropertyStatusChangeBlockedError,
} from '@solutio/db/properties-service';
import { getTenantContext } from '@/lib/tenant-context';
import { hasRole } from '@solutio/shared/tenant';

export type SetStatusState = { ok: true } | { ok: false; message: string };

export async function setPropertyStatusAction(
  _prev: SetStatusState | null,
  formData: FormData,
): Promise<SetStatusState> {
  const ctx = await getTenantContext();
  if (!ctx) return { ok: false, message: 'Not signed in' };
  if (!hasRole(ctx, ['OWNER', 'ADMIN'])) return { ok: false, message: 'Forbidden' };

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
