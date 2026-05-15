import { describe, expect, test } from 'vitest';
import { render, screen } from '@testing-library/react';
import { InstallmentsTable, type InstallmentRow } from '../installments-table';

const row = (overrides: Partial<InstallmentRow> = {}): InstallmentRow => ({
  id: 'i-1',
  sequenceNo: 0,
  dueDate: new Date('2026-06-01T00:00:00Z'),
  amountDueKobo: 50_000_000n,
  amountPaidKobo: 0n,
  status: 'PENDING',
  ...overrides,
});

describe('InstallmentsTable', () => {
  test('renders rows in the provided order', () => {
    render(
      <InstallmentsTable
        installments={[
          row({ id: 'a', sequenceNo: 0 }),
          row({ id: 'b', sequenceNo: 1, dueDate: new Date('2026-07-01T00:00:00Z') }),
        ]}
      />,
    );
    const cells = screen.getAllByRole('cell');
    expect(cells[0]!.textContent).toBe('0');
  });

  test('formats money with NGN symbol', () => {
    render(<InstallmentsTable installments={[row({ amountDueKobo: 50_000_000n })]} />);
    expect(screen.getAllByText(/₦500,000/).length).toBeGreaterThanOrEqual(1);
  });

  test('computes balance = due - paid', () => {
    render(
      <InstallmentsTable
        installments={[row({ amountDueKobo: 50_000_000n, amountPaidKobo: 20_000_000n })]}
      />,
    );
    expect(screen.getByText(/₦300,000/)).toBeInTheDocument();
  });

  test('renders the status badge text', () => {
    render(<InstallmentsTable installments={[row({ status: 'PAID' })]} />);
    expect(screen.getByText('PAID')).toBeInTheDocument();
  });
});
