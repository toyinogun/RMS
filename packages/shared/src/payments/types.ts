import type { Kobo } from '../money/index.js';

export type PaymentMethod = 'CASH' | 'TRANSFER' | 'CHEQUE' | 'CARD_MANUAL' | 'OTHER';

export type InstallmentRow = {
  id: string;
  sequenceNo: number;
  amountDueKobo: Kobo;
  amountPaidKobo: Kobo;
};

export type Allocation = {
  installmentId: string;
  amountKobo: Kobo;
};

export type AllocationResult = {
  allocations: Allocation[];
  remainderKobo: Kobo;
};
