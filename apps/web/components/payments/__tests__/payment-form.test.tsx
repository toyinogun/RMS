import { describe, expect, test, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Kobo } from '@solutio/shared/money';

const { routerPushMock, routerRefreshMock, toastSuccessMock, toastErrorMock } =
  vi.hoisted(() => ({
    routerPushMock: vi.fn(),
    routerRefreshMock: vi.fn(),
    toastSuccessMock: vi.fn(),
    toastErrorMock: vi.fn(),
  }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: routerPushMock, refresh: routerRefreshMock }),
}));
vi.mock('sonner', () => ({
  toast: { success: toastSuccessMock, error: toastErrorMock },
}));

import { PaymentForm } from '../payment-form';

const PLAN_ID = '550e8400-e29b-41d4-a716-446655440010';
const INST_1 = '550e8400-e29b-41d4-a716-446655440101';
const INST_2 = '550e8400-e29b-41d4-a716-446655440102';
const INST_3 = '550e8400-e29b-41d4-a716-446655440103';

const plan = {
  id: PLAN_ID,
  customerName: 'Adaeze Okafor',
  propertyCode: 'CEDAR-12',
  totalPriceKobo: 30_000_000n as Kobo,        // ₦300,000
  outstandingKobo: 30_000_000n as Kobo,
  status: 'ACTIVE' as const,
};

const installments = [
  {
    id: INST_1,
    sequenceNo: 1,
    dueDate: new Date('2026-06-01'),
    amountDueKobo: 10_000_000n as Kobo,        // ₦100,000
    amountPaidKobo: 0n as Kobo,
    status: 'PENDING' as const,
  },
  {
    id: INST_2,
    sequenceNo: 2,
    dueDate: new Date('2026-07-01'),
    amountDueKobo: 10_000_000n as Kobo,
    amountPaidKobo: 0n as Kobo,
    status: 'PENDING' as const,
  },
  {
    id: INST_3,
    sequenceNo: 3,
    dueDate: new Date('2026-08-01'),
    amountDueKobo: 10_000_000n as Kobo,
    amountPaidKobo: 0n as Kobo,
    status: 'PENDING' as const,
  },
];

function renderForm(onSubmit = vi.fn()) {
  render(
    <PaymentForm plan={plan} installments={installments} onSubmit={onSubmit} />,
  );
  return onSubmit;
}

beforeEach(() => {
  routerPushMock.mockReset();
  routerRefreshMock.mockReset();
  toastSuccessMock.mockReset();
  toastErrorMock.mockReset();
});

describe('PaymentForm', () => {
  test('renders Auto mode by default; preview table appears once a non-zero amount is typed', async () => {
    const user = userEvent.setup();
    renderForm();

    // Default mode is Auto.
    const autoRadio = screen.getByLabelText(/auto \(fifo\)/i) as HTMLInputElement;
    const manualRadio = screen.getByLabelText(/manual override/i) as HTMLInputElement;
    expect(autoRadio.checked).toBe(true);
    expect(manualRadio.checked).toBe(false);

    // Empty amount → placeholder text instead of table.
    expect(
      screen.getByText(/enter an amount to preview how it will be allocated/i),
    ).toBeInTheDocument();
    expect(screen.queryByRole('table')).toBeNull();

    // Type ₦150,000 (covers first inst + half of second).
    await user.type(screen.getByLabelText(/amount/i), '150,000');

    const table = await screen.findByRole('table');
    expect(table).toBeInTheDocument();
    // FIFO: row 1 gets ₦100,000, row 2 gets ₦50,000, row 3 gets ₦0.
    const rows = within(table).getAllByRole('row');
    // header + 3 data rows
    expect(rows).toHaveLength(4);
  });

  test('toggling to Manual reveals editable allocation rows pre-filled with FIFO suggestion', async () => {
    const user = userEvent.setup();
    renderForm();

    await user.type(screen.getByLabelText(/amount/i), '150,000');
    await user.click(screen.getByLabelText(/manual override/i));

    // Editable money inputs appear, one per non-PAID installment.
    const allocInputs = screen.getAllByLabelText(/allocation for installment/i);
    expect(allocInputs).toHaveLength(3);

    // Pre-fill matches FIFO: 100,000 / 50,000 / 0.
    expect((allocInputs[0] as HTMLInputElement).value).toBe('100,000');
    expect((allocInputs[1] as HTMLInputElement).value).toBe('50,000');
    expect((allocInputs[2] as HTMLInputElement).value).toBe('0');
  });

  test('Manual mode: Submit is disabled when allocations do not sum to the amount', async () => {
    const user = userEvent.setup();
    renderForm();

    await user.type(screen.getByLabelText(/amount/i), '200,000');
    await user.click(screen.getByLabelText(/manual override/i));

    const allocInputs = screen.getAllByLabelText(/allocation for installment/i);
    // FIFO pre-fill is 100k / 100k / 0 = 200k → balanced. Reduce the second
    // row so the sum drops to 100k while amount is 200k.
    await user.clear(allocInputs[1]!);
    await user.type(allocInputs[1]!, '0');

    const submit = screen.getByRole('button', { name: /record payment/i });
    expect(submit).toBeDisabled();

    // Balance strip reflects the imbalance.
    const strip = screen.getByTestId('manual-balance-strip');
    expect(within(strip).getByText(/unallocated:/i)).toBeInTheDocument();
  });

  test('Manual mode: Submit is enabled when allocations sum exactly to the amount', async () => {
    const user = userEvent.setup();
    renderForm();

    await user.type(screen.getByLabelText(/amount/i), '200,000');
    await user.click(screen.getByLabelText(/manual override/i));
    // FIFO pre-fill already balances 200k as 100k + 100k + 0.

    const submit = screen.getByRole('button', { name: /record payment/i });
    expect(submit).not.toBeDisabled();
  });

  test('Auto-mode submission omits allocations[*] keys from FormData', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue({
      ok: true,
      data: { paymentId: 'pay-1', planStatus: 'ACTIVE' },
    });
    renderForm(onSubmit);

    await user.type(screen.getByLabelText(/amount/i), '100,000');
    await user.click(screen.getByRole('button', { name: /record payment/i }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    const fd = onSubmit.mock.calls[0]![0] as FormData;
    expect(fd.get('planId')).toBe(PLAN_ID);
    expect(fd.get('amountNgn')).toBe('100,000');
    expect(fd.get('method')).toBe('CASH');
    expect(fd.has('allocations[0].installmentId')).toBe(false);
    expect(fd.has('allocations[0].amountNgn')).toBe(false);
  });

  test('Manual-mode submission includes allocations[*] keys for each non-zero row', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue({
      ok: true,
      data: { paymentId: 'pay-2', planStatus: 'ACTIVE' },
    });
    renderForm(onSubmit);

    // Amount 250,000 → FIFO pre-fill: 100k + 100k + 50k (all rows non-zero).
    await user.type(screen.getByLabelText(/amount/i), '250,000');
    await user.click(screen.getByLabelText(/manual override/i));
    await user.click(screen.getByRole('button', { name: /record payment/i }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    const fd = onSubmit.mock.calls[0]![0] as FormData;
    expect(fd.get('allocations[0].installmentId')).toBe(INST_1);
    expect(fd.get('allocations[0].amountNgn')).toBe('100,000');
    expect(fd.get('allocations[1].installmentId')).toBe(INST_2);
    expect(fd.get('allocations[1].amountNgn')).toBe('100,000');
    expect(fd.get('allocations[2].installmentId')).toBe(INST_3);
    expect(fd.get('allocations[2].amountNgn')).toBe('50,000');
  });

  test('Schema-level error (amount = 0) surfaces as a field error and does not call onSubmit', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    renderForm(onSubmit);

    await user.type(screen.getByLabelText(/amount/i), '0');
    await user.click(screen.getByRole('button', { name: /record payment/i }));

    expect(onSubmit).not.toHaveBeenCalled();
    // The schema rejects amount <= 0 with "Amount must be greater than zero".
    expect(
      await screen.findByText(/amount must be greater than zero/i),
    ).toBeInTheDocument();
  });

  test('On ok=true, toast success fires and router.push goes to the plan detail page', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue({
      ok: true,
      data: { paymentId: 'pay-3', planStatus: 'ACTIVE' },
    });
    renderForm(onSubmit);

    await user.type(screen.getByLabelText(/amount/i), '100,000');
    await user.click(screen.getByRole('button', { name: /record payment/i }));

    expect(toastSuccessMock).toHaveBeenCalledWith('Payment recorded');
    expect(routerPushMock).toHaveBeenCalledWith(`/plans/${PLAN_ID}`);
  });

  test('On ok=false with fieldErrors, the field error renders in the DOM', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue({
      ok: false,
      message: 'Please fix the highlighted fields',
      fieldErrors: { amountNgn: 'Payment exceeds outstanding balance by ₦50,000.' },
    });
    renderForm(onSubmit);

    await user.type(screen.getByLabelText(/amount/i), '100,000');
    await user.click(screen.getByRole('button', { name: /record payment/i }));

    expect(
      await screen.findByText(/payment exceeds outstanding balance/i),
    ).toBeInTheDocument();
    expect(routerPushMock).not.toHaveBeenCalled();
  });

  test('On retry-failure message, toast.error fires and router.push is NOT called', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue({
      ok: false,
      message: 'Could not record payment due to a concurrent update. Try again.',
    });
    renderForm(onSubmit);

    await user.type(screen.getByLabelText(/amount/i), '100,000');
    await user.click(screen.getByRole('button', { name: /record payment/i }));

    expect(toastErrorMock).toHaveBeenCalledWith(
      'Could not record payment due to a concurrent update. Try again.',
    );
    expect(routerPushMock).not.toHaveBeenCalled();
  });
});
