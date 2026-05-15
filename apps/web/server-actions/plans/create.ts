'use server';

import { revalidatePath } from 'next/cache';
import type { ZodError } from 'zod';
import { planCreateSchema } from '@solutio/shared/installments';
import {
  createPlan,
  PropertyNotAvailableError,
  CustomerNotFoundError,
} from '@solutio/db/plans-service';
import { getTenantContext } from '@/lib/tenant-context';
import { hasRole } from '@solutio/shared/tenant';

export type PlanCreateState =
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

function buildCustomerInput(formData: FormData) {
  const mode = formData.get('customerMode');
  if (mode === 'existing') {
    return { mode: 'existing', id: formData.get('customerId') };
  }
  if (mode === 'new') {
    return {
      mode: 'new',
      fullName: formData.get('customerFullName'),
      phone: formData.get('customerPhone'),
      email: formData.get('customerEmail') ?? '',
      nationalId: formData.get('customerNationalId') ?? '',
      notes: formData.get('customerNotes') ?? '',
    };
  }
  return { mode };
}

export async function createPlanAction(
  _prev: PlanCreateState | null,
  formData: FormData,
): Promise<PlanCreateState> {
  const ctx = await getTenantContext();
  if (!ctx) return { ok: false, message: 'Not signed in' };
  if (!hasRole(ctx, ['OWNER', 'ADMIN', 'STAFF'])) return { ok: false, message: 'Forbidden' };

  const parsed = planCreateSchema.safeParse({
    customer: buildCustomerInput(formData),
    propertyId: formData.get('propertyId'),
    totalPriceNgn: formData.get('totalPriceNgn'),
    depositNgn: formData.get('depositNgn'),
    monthlyNgn: formData.get('monthlyNgn'),
    termMonths: formData.get('termMonths'),
    startDate: formData.get('startDate'),
    depositReceived: formData.get('depositReceived') === 'true',
    depositMethod: formData.get('depositMethod')?.toString() || undefined,
    depositPaidAt: formData.get('depositPaidAt')?.toString() || undefined,
    depositReference: formData.get('depositReference')?.toString() || undefined,
    depositNotes: formData.get('depositNotes')?.toString() || undefined,
  });
  if (!parsed.success) {
    return {
      ok: false,
      message: 'Please fix the highlighted fields',
      fieldErrors: flattenZod(parsed.error),
    };
  }

  try {
    const created = await createPlan(ctx, parsed.data);
    revalidatePath('/plans');
    revalidatePath('/properties');
    return { ok: true, data: { id: created.id } };
  } catch (err) {
    if (err instanceof PropertyNotAvailableError) {
      return {
        ok: false,
        message: 'That property is no longer available. Refresh and try again.',
      };
    }
    if (err instanceof CustomerNotFoundError) {
      return {
        ok: false,
        message: 'Selected customer no longer exists. Refresh and try again.',
      };
    }
    throw err;
  }
}
