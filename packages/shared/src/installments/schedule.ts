import type { Kobo } from '../money/index.js';
import type { ScheduleInput, ScheduleRow } from './types.js';

const MIN_TERM = 6;
const MAX_TERM = 36;

export function generateSchedule(input: ScheduleInput): ScheduleRow[] {
  const { totalPriceKobo, depositKobo, monthlyKobo, termMonths, startDate } = input;

  if (termMonths < MIN_TERM || termMonths > MAX_TERM) {
    throw new Error(`termMonths must be between ${MIN_TERM} and ${MAX_TERM}, got ${termMonths}`);
  }
  if (depositKobo > totalPriceKobo) {
    throw new Error('depositKobo cannot exceed totalPriceKobo');
  }
  const monthlyTotal = monthlyKobo * BigInt(termMonths);
  const sumStandard = depositKobo + monthlyTotal;
  // Allow sumStandard to be up to one monthly below total (rounding absorbed by final row).
  // If shortfall exceeds one monthly, the plan is structurally underfunded.
  if (sumStandard + monthlyKobo < totalPriceKobo) {
    throw new Error(
      `Plan would underfund: deposit + monthly*term (${sumStandard}) < total (${totalPriceKobo})`,
    );
  }

  const rows: ScheduleRow[] = [];
  rows.push({
    sequenceNo: 0,
    dueDate: new Date(startDate),
    amountDueKobo: depositKobo,
  });

  const remaining = totalPriceKobo - depositKobo;
  const standardMonthsTotal = monthlyKobo * BigInt(termMonths - 1);
  const finalAmount = (remaining - standardMonthsTotal) as Kobo;

  for (let i = 1; i <= termMonths; i++) {
    const due = addMonths(startDate, i);
    const amount = i === termMonths ? finalAmount : monthlyKobo;
    rows.push({ sequenceNo: i, dueDate: due, amountDueKobo: amount });
  }
  return rows;
}

function addMonths(base: Date, months: number): Date {
  const d = new Date(base);
  const targetMonth = d.getUTCMonth() + months;
  d.setUTCMonth(targetMonth);
  return d;
}
