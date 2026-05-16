import type { Kobo } from '../money/index';

export type { PaymentMethod } from './schemas';

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
