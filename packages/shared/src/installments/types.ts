import type { Kobo } from '../money/index';

export type InstallmentStatus = 'PENDING' | 'PARTIAL' | 'PAID' | 'OVERDUE' | 'WAIVED';

export type ScheduleRow = {
  sequenceNo: number;
  dueDate: Date;
  amountDueKobo: Kobo;
};

export type ScheduleInput = {
  totalPriceKobo: Kobo;
  depositKobo: Kobo;
  monthlyKobo: Kobo;
  termMonths: number;
  startDate: Date;
};
