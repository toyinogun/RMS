import type { Kobo } from '../money/index.js';
import type { InstallmentStatus } from './types.js';

export type DeriveStatusInput = {
  amountDueKobo: Kobo;
  amountPaidKobo: Kobo;
  dueDate: Date;
  currentStatus: InstallmentStatus;
  today: Date;
};

export function deriveInstallmentStatus(input: DeriveStatusInput): InstallmentStatus {
  if (input.currentStatus === 'WAIVED') return 'WAIVED';
  if (input.amountPaidKobo >= input.amountDueKobo) return 'PAID';
  if (input.amountPaidKobo > 0n) return 'PARTIAL';
  return input.dueDate.getTime() < input.today.getTime() ? 'OVERDUE' : 'PENDING';
}
