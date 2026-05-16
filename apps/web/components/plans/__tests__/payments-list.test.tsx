import { describe, expect, test } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import type { PaymentListRow } from '@solutio/db/payments-service';
import type { Kobo } from '@solutio/shared/money';
import { PaymentsList } from '../payments-list';

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
  ...overrides,
});

describe('PaymentsList', () => {
  test('renders rows in the order supplied by the parent', () => {
    render(
      <PaymentsList
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
    render(<PaymentsList payments={[baseRow({ amountKobo: 150_000_00n as Kobo })]} />);
    expect(screen.getByText('₦150,000.00')).toBeInTheDocument();
  });

  test('allocation breakdown is rendered into DOM inside a <details> (closed by default)', () => {
    const { container } = render(
      <PaymentsList
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
    render(<PaymentsList payments={[]} />);
    expect(screen.getByText('No payments recorded yet.')).toBeInTheDocument();
    // No table renders in the empty branch.
    expect(screen.queryByRole('table')).toBeNull();
  });

  test('renders an em-dash for null reference and recordedByName', () => {
    render(
      <PaymentsList
        payments={[
          baseRow({ id: 'p-no-ref', reference: null, recordedByName: null }),
        ]}
      />,
    );
    // Two cells should hold an em-dash (reference + recorded by).
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(2);
  });
});
