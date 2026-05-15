'use server';

import { revalidatePath } from 'next/cache';
import type { ZodError } from 'zod';
import { propertyCreateSchema } from '@solutio/shared/properties';
import { createProperty, PropertyCodeConflictError } from '@solutio/db/properties-service';
import { getTenantContext } from '@/lib/tenant-context';
import { hasRole } from '@solutio/shared/tenant';

export type PropertyActionState =
  | { ok: true; data: { id: string } }
  | { ok: false; message: string; fieldErrors?: Record<string, string> };

function flattenZod(err: ZodError): Record<string, string> {
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
  if (!hasRole(ctx, ['OWNER', 'ADMIN', 'STAFF'])) return { ok: false, message: 'Forbidden' };

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
    const created = await createProperty(ctx, parsed.data);
    revalidatePath('/properties');
    return { ok: true, data: { id: created.id } };
  } catch (err) {
    if (err instanceof PropertyCodeConflictError) {
      return { ok: false, message: 'Property code already in use', fieldErrors: { code: 'Already in use' } };
    }
    throw err;
  }
}
