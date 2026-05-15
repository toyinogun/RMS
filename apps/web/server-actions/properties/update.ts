'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { propertyUpdateSchema } from '@solutio/shared/properties';
import { prisma } from '@solutio/db/client';
import { updateProperty, PropertyNotFoundError, PropertyCodeConflictError } from '@solutio/db/properties-service';
import { getTenantContext } from '@/lib/tenant-context';
import { hasRole } from '@solutio/shared/tenant';
import type { PropertyActionState } from './create';

function flattenZod(err: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of err.issues) {
    const path = issue.path.join('.');
    if (!out[path]) out[path] = issue.message;
  }
  return out;
}

export async function updatePropertyAction(
  _prev: PropertyActionState | null,
  formData: FormData,
): Promise<PropertyActionState> {
  const ctx = await getTenantContext();
  if (!ctx) return { ok: false, message: 'Not signed in' };
  if (!hasRole(ctx, ['OWNER', 'ADMIN', 'STAFF'])) return { ok: false, message: 'Forbidden' };

  const parsed = propertyUpdateSchema.safeParse({
    id: formData.get('id'),
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
    const updated = await updateProperty(prisma, ctx, parsed.data);
    revalidatePath('/properties');
    revalidatePath(`/properties/${updated.id}`);
    return { ok: true, data: { id: updated.id } };
  } catch (err) {
    if (err instanceof PropertyNotFoundError) {
      return { ok: false, message: 'Property not found' };
    }
    if (err instanceof PropertyCodeConflictError) {
      return { ok: false, message: 'Property code already in use', fieldErrors: { code: 'Already in use' } };
    }
    throw err;
  }
}
