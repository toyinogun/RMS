'use server';

import { revalidatePath } from 'next/cache';
import { planCancelSchema } from '@solutio/shared/installments';
import {
  cancelPlan,
  PlanNotFoundError,
  PlanHasPaymentsError,
} from '@solutio/db/plans-service';
import { getTenantContext } from '@/lib/tenant-context';
import { hasRole } from '@solutio/shared/tenant';

export type PlanCancelState =
  | { ok: true; data: { id: string } }
  | { ok: false; message: string };

export async function cancelPlanAction(
  _prev: PlanCancelState | null,
  formData: FormData,
): Promise<PlanCancelState> {
  const ctx = await getTenantContext();
  if (!ctx) return { ok: false, message: 'Not signed in' };
  if (!hasRole(ctx, ['OWNER', 'ADMIN'])) return { ok: false, message: 'Forbidden' };

  const parsed = planCancelSchema.safeParse({ id: formData.get('id') });
  if (!parsed.success) return { ok: false, message: 'Invalid input' };

  try {
    await cancelPlan(ctx, parsed.data);
    revalidatePath('/plans');
    revalidatePath(`/plans/${parsed.data.id}`);
    return { ok: true, data: { id: parsed.data.id } };
  } catch (err) {
    if (err instanceof PlanNotFoundError) return { ok: false, message: 'Plan not found' };
    if (err instanceof PlanHasPaymentsError) {
      return {
        ok: false,
        message: 'This plan has recorded payments. Reverse them before cancelling.',
      };
    }
    throw err;
  }
}
