import { describe, expect, test, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import type { PaymentListRow, ReversePaymentResult } from '@solutio/db/payments-service';
import type { Kobo } from '@solutio/shared/money';
import type { UserRole } from '@solutio/shared/tenant';
import { PaymentsList } from '../payments-list';

// Derive PlanStatus from the service layer — same pattern as the component.
type PlanStatus = ReversePaymentResult['planStatus'];

// Mock the client-side ReversePaymentDialog so the server component test
// doesn't need to wire up all client-only React dependencies.
vi.mock('@/components/payments/reverse-payment-dialog', () => ({
  ReversePaymentDialog: ({
    trigger,
    payment,
  }: {
    trigger: React.ReactNode;
    payment: { id: string };
  }) => (
    <span data-testid={`reverse-dialog-${payment.id}`}>{trigger}</span>
  ),
}));

const baseRow = (overrides: Partial<PaymentListRow> = {}): PaymentListRow => ({
  id: 'p-1',
  amountKobo: 150_000_00n as Kobo,
  paidAt: new Date('2026-06-01T08:00:00Z'),
  method: 'TRANSFER',
  reference: null,
  notes: null,
  recordedByUserId: 'u-1',
  recordedByName: 'Recorder One',
  createdAt: new Date('2026-06-01T08:00:00Z'),
  allocations: [
    {
      id: 'a-1',
      installmentId: 'i-1',
      installmentSequenceNo: 1,
      amountKobo: 150_000_00n as Kobo,
    },
  ],
  reversedById: null,
  reversedByPaymentId: null,
  ...overrides,
});

const defaultProps = {
  userRole: 'OWNER' as UserRole,
  planStatus: 'ACTIVE' as PlanStatus,
  planId: 'plan-1',
};

describe('PaymentsList', () => {
  test('renders rows in the order supplied by the parent', () => {
    render(
      <PaymentsList
        {...defaultProps}
        payments={[
          baseRow({ id: 'newer', paidAt: new Date('2026-07-01T08:00:00Z') }),
          baseRow({ id: 'older', paidAt: new Date('2026-06-01T08:00:00Z') }),
        ]}
      />,
    );
    const rows = screen.getAllByRole('row');
    // rows[0] is the header; data rows start at index 1.
    expect(within(rows[1]!).getByText('2026-07-01')).toBeInTheDocument();
    expect(within(rows[2]!).getByText('2026-06-01')).toBeInTheDocument();
  });

  test('formats amounts via formatKobo with NGN symbol', () => {
    render(
      <PaymentsList
        {...defaultProps}
        payments={[baseRow({ amountKobo: 150_000_00n as Kobo })]}
      />,
    );
    expect(screen.getByText('₦150,000.00')).toBeInTheDocument();
  });

  test('allocation breakdown is rendered into DOM inside a <details> (closed by default)', () => {
    const { container } = render(
      <PaymentsList
        {...defaultProps}
        payments={[
          baseRow({
            allocations: [
              {
                id: 'a-1',
                installmentId: 'i-1',
                installmentSequenceNo: 1,
                amountKobo: 100_000_00n as Kobo,
              },
              {
                id: 'a-2',
                installmentId: 'i-2',
                installmentSequenceNo: 2,
                amountKobo: 50_000_00n as Kobo,
              },
            ],
          }),
        ]}
      />,
    );
    const details = container.querySelector('details');
    expect(details).not.toBeNull();
    // <details> without `open` attr defaults to closed; content still in DOM.
    expect(details!.hasAttribute('open')).toBe(false);
    expect(screen.getByText(/Installment #1/)).toBeInTheDocument();
    expect(screen.getByText(/Installment #2/)).toBeInTheDocument();
  });

  test('renders the empty state when no payments are passed', () => {
    render(<PaymentsList {...defaultProps} payments={[]} />);
    expect(screen.getByText('No payments recorded yet.')).toBeInTheDocument();
    // No table renders in the empty branch.
    expect(screen.queryByRole('table')).toBeNull();
  });

  test('renders an em-dash for null reference and recordedByName', () => {
    render(
      <PaymentsList
        {...defaultProps}
        payments={[
          baseRow({ id: 'p-no-ref', reference: null, recordedByName: null }),
        ]}
      />,
    );
    // Two cells should hold an em-dash (reference + recorded by).
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(2);
  });

  // ─── Role-gating: STAFF users never see Reverse buttons ─────────────────────

  test('STAFF user: no Reverse button regardless of row state', () => {
    render(
      <PaymentsList
        userRole="STAFF"
        planStatus="ACTIVE"
        planId="plan-1"
        payments={[
          baseRow({ id: 'p-fresh' }),
          baseRow({ id: 'p-reversed', reversedByPaymentId: 'rev-1' }),
          baseRow({ id: 'p-reversal', reversedById: 'orig-1' }),
        ]}
      />,
    );
    expect(screen.queryByRole('button', { name: /reverse/i })).toBeNull();
  });

  // ─── OWNER/ADMIN: fresh row gets Reverse button ──────────────────────────────

  test('OWNER user, fully-fresh row: Reverse button shown', () => {
    render(
      <PaymentsList
        userRole="OWNER"
        planStatus="ACTIVE"
        planId="plan-1"
        payments={[baseRow({ id: 'p-1', reversedById: null, reversedByPaymentId: null })]}
      />,
    );
    expect(screen.getByRole('button', { name: /reverse/i })).toBeInTheDocument();
  });

  test('ADMIN user, fully-fresh row: Reverse button shown', () => {
    render(
      <PaymentsList
        userRole="ADMIN"
        planStatus="ACTIVE"
        planId="plan-1"
        payments={[baseRow({ id: 'p-1', reversedById: null, reversedByPaymentId: null })]}
      />,
    );
    expect(screen.getByRole('button', { name: /reverse/i })).toBeInTheDocument();
  });

  // ─── OWNER: reversed row — no Reverse button + "Reversed" badge ─────────────

  test('OWNER user, reversed row (reversedByPaymentId non-null): no Reverse button, "Reversed" badge shown', () => {
    render(
      <PaymentsList
        userRole="OWNER"
        planStatus="ACTIVE"
        planId="plan-1"
        payments={[
          baseRow({ id: 'p-1', reversedByPaymentId: 'rev-1', reversedById: null }),
        ]}
      />,
    );
    expect(screen.queryByRole('button', { name: /reverse/i })).toBeNull();
    expect(screen.getByText('Reversed')).toBeInTheDocument();
  });

  // ─── OWNER: reversal row — no Reverse button + "Reversal" badge + negative amount ─

  test('OWNER user, reversal row (reversedById non-null): no Reverse button, "Reversal" badge shown, amount negative red', () => {
    render(
      <PaymentsList
        userRole="OWNER"
        planStatus="ACTIVE"
        planId="plan-1"
        payments={[
          baseRow({
            id: 'p-rev',
            reversedById: 'orig-1',
            reversedByPaymentId: null,
            amountKobo: -150_000_00n as unknown as Kobo,
          }),
        ]}
      />,
    );
    expect(screen.queryByRole('button', { name: /reverse/i })).toBeNull();
    expect(screen.getByText('Reversal')).toBeInTheDocument();
    // Negative amount is displayed with leading minus in red.
    const negAmount = screen.getByText(/-₦150,000\.00/);
    expect(negAmount).toBeInTheDocument();
    expect(negAmount.className).toMatch(/text-status-overdue|text-red/);
  });

  // ─── Mutual exclusivity: a row with both fields null gets neither badge ──────

  test('row with both reversedById and reversedByPaymentId null: no "Reversed" or "Reversal" badges', () => {
    render(
      <PaymentsList
        userRole="OWNER"
        planStatus="ACTIVE"
        planId="plan-1"
        payments={[baseRow({ id: 'p-clean', reversedById: null, reversedByPaymentId: null })]}
      />,
    );
    expect(screen.queryByText('Reversed')).toBeNull();
    expect(screen.queryByText('Reversal')).toBeNull();
  });

  // ─── planCurrentlyCompleted is derived from planStatus === 'COMPLETED' ───────

  test('planStatus COMPLETED: Reverse button still shown for fresh OWNER row', () => {
    render(
      <PaymentsList
        userRole="OWNER"
        planStatus="COMPLETED"
        planId="plan-1"
        payments={[baseRow({ id: 'p-1', reversedById: null, reversedByPaymentId: null })]}
      />,
    );
    // The Reverse button still renders when planStatus is COMPLETED; role gating
    // only suppresses it for STAFF. Plan re-opening warning is shown inside the dialog.
    expect(screen.getByRole('button', { name: /reverse/i })).toBeInTheDocument();
  });
});
