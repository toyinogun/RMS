import { describe, expect, test, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Hoisted mocks so vi.mock factories can reference them.
const {
  toastSuccessMock,
  toastErrorMock,
  reversePaymentActionMock,
  useFormStatusPendingRef,
} = vi.hoisted(() => ({
  toastSuccessMock: vi.fn(),
  toastErrorMock: vi.fn(),
  reversePaymentActionMock: vi.fn(),
  useFormStatusPendingRef: { current: false },
}));

vi.mock('sonner', () => ({
  toast: { success: toastSuccessMock, error: toastErrorMock },
}));

vi.mock('@/server-actions/payments/reverse', () => ({
  reversePaymentAction: reversePaymentActionMock,
}));

vi.mock('react-dom', async (importOriginal) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const actual = await importOriginal<any>();
  return {
    ...actual,
    useFormStatus: () => ({ pending: useFormStatusPendingRef.current }),
  };
});

import type { PaymentMethod } from '@solutio/shared/payments';
import { ReversePaymentDialog } from '../reverse-payment-dialog';
import { REVERSAL_ALREADY_REVERSED_MESSAGE } from '@/server-actions/payments/messages';

const PLAN_ID = '550e8400-e29b-41d4-a716-446655440010';
const PAYMENT_ID = '550e8400-e29b-41d4-a716-446655440020';

function makePayment(overrides: {
  allocations?: Array<{ installmentSequenceNo: number; amountKobo: bigint }>;
} = {}) {
  return {
    id: PAYMENT_ID,
    amountKobo: 10_000_000n,
    paidAt: new Date('2026-05-01'),
    method: 'TRANSFER' as PaymentMethod,
    allocations: overrides.allocations ?? [
      { installmentSequenceNo: 1, amountKobo: 6_000_000n },
      { installmentSequenceNo: 2, amountKobo: 4_000_000n },
    ],
  };
}

function renderDialog(props: {
  payment?: ReturnType<typeof makePayment>;
  planId?: string;
  planCurrentlyCompleted?: boolean;
} = {}) {
  const payment = props.payment ?? makePayment();
  const planId = props.planId ?? PLAN_ID;
  const planCurrentlyCompleted = props.planCurrentlyCompleted ?? false;

  render(
    <ReversePaymentDialog
      payment={payment}
      planId={planId}
      planCurrentlyCompleted={planCurrentlyCompleted}
      trigger={<button>Open Reverse Dialog</button>}
    />,
  );
}

async function openDialog() {
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: /open reverse dialog/i }));
  // Wait for dialog content to be present.
  await screen.findByRole('dialog');
  return user;
}

beforeEach(() => {
  toastSuccessMock.mockReset();
  toastErrorMock.mockReset();
  reversePaymentActionMock.mockReset();
  useFormStatusPendingRef.current = false;
});

describe('ReversePaymentDialog', () => {
  test('renders consequences preview with correct allocation count', async () => {
    renderDialog();
    await openDialog();

    // Two allocations → two "unallocated" lines
    expect(screen.getByText(/installment #1/i)).toBeInTheDocument();
    expect(screen.getByText(/installment #2/i)).toBeInTheDocument();

    // Baseline consequence: a new reversal payment line
    expect(
      screen.getByText(/a new reversal payment/i),
    ).toBeInTheDocument();

    // Static notes
    expect(
      screen.getByText(/the property's status is not affected/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/reversals cannot themselves be reversed/i),
    ).toBeInTheDocument();
  });

  test('shows "plan will reopen" line only when planCurrentlyCompleted is true', async () => {
    // Not completed → line should NOT appear
    renderDialog({ planCurrentlyCompleted: false });
    await openDialog();
    expect(
      screen.queryByText(/the plan will reopen/i),
    ).not.toBeInTheDocument();
  });

  test('shows "plan will reopen" line when planCurrentlyCompleted is true', async () => {
    renderDialog({ planCurrentlyCompleted: true });
    await openDialog();
    expect(
      screen.getByText(/the plan will reopen/i),
    ).toBeInTheDocument();
  });

  test('disables the Reverse button while form submission is pending', async () => {
    useFormStatusPendingRef.current = true;
    renderDialog();
    await openDialog();

    // When pending, button shows "Reversing…" and is disabled.
    const reverseBtn = screen.getByRole('button', { name: /reversing/i });
    expect(reverseBtn).toBeDisabled();
  });

  test('on M5_ALREADY_REVERSED error: shows error toast and dialog stays open', async () => {
    reversePaymentActionMock.mockResolvedValue({
      ok: false,
      code: 'M5_ALREADY_REVERSED',
      message: REVERSAL_ALREADY_REVERSED_MESSAGE,
    });

    renderDialog();
    const user = await openDialog();

    await user.click(screen.getByRole('button', { name: /^reverse$/i }));

    await waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalledWith(REVERSAL_ALREADY_REVERSED_MESSAGE);
    });

    // Dialog should still be visible (user must dismiss it themselves)
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(toastSuccessMock).not.toHaveBeenCalled();
  });

  test('on ok=true: shows success toast', async () => {
    reversePaymentActionMock.mockResolvedValue({
      ok: true,
      reversalPaymentId: 'rev-123',
      planStatus: 'ACTIVE',
    });

    renderDialog();
    const user = await openDialog();

    await user.click(screen.getByRole('button', { name: /^reverse$/i }));

    await waitFor(() => {
      expect(toastSuccessMock).toHaveBeenCalledWith('Payment reversed.');
    });
    expect(toastErrorMock).not.toHaveBeenCalled();
  });

  test('header displays the formatted payment amount', async () => {
    // ₦100,000.00
    renderDialog({ payment: makePayment() });
    await openDialog();

    // Header: "Reverse payment of ₦100,000.00"
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(
      /reverse payment of/i,
    );
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(
      /₦100,000\.00/,
    );
  });

  test('hidden inputs are present with correct values', async () => {
    renderDialog({ payment: makePayment(), planId: PLAN_ID });
    await openDialog();

    const paymentIdInput = document.querySelector(
      'input[name="paymentId"]',
    ) as HTMLInputElement;
    const planIdInput = document.querySelector(
      'input[name="planId"]',
    ) as HTMLInputElement;

    expect(paymentIdInput?.value).toBe(PAYMENT_ID);
    expect(planIdInput?.value).toBe(PLAN_ID);
  });

  test('reason textarea is present with maxLength 500', async () => {
    renderDialog();
    await openDialog();

    const textarea = screen.getByRole('textbox', { name: /reason/i });
    expect(textarea).toBeInTheDocument();
    expect(textarea).toHaveAttribute('maxlength', '500');
    expect(textarea).toHaveAttribute('name', 'reason');
  });
});
