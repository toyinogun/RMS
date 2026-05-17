import { describe, expect, test } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RecentActivityTable } from '../recent-activity-table';
import type { RecentActivityRow } from '@solutio/db/dashboard-service';
import type { Kobo } from '@solutio/shared/money';

const fakeRow = (overrides: Partial<RecentActivityRow> = {}): RecentActivityRow => ({
  id: 'pay-1',
  planId: 'plan-1',
  amountKobo: 5_000_000n as Kobo,
  paidAt: new Date('2026-05-17T10:00:00Z'),
  method: 'CASH',
  isReversal: false,
  customerName: 'Ada Lovelace',
  propertyCode: 'AH-001',
  ...overrides,
});

describe('<RecentActivityTable />', () => {
  test('renders empty state when rows is []', () => {
    render(<RecentActivityTable rows={[]} />);
    expect(screen.getByText(/no payments yet/i)).toBeInTheDocument();
  });

  test('renders one row per payment with customer + property + amount + link', () => {
    render(<RecentActivityTable rows={[fakeRow()]} />);
    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
    expect(screen.getByText('AH-001')).toBeInTheDocument();
    expect(screen.getByText('₦50,000.00')).toBeInTheDocument();
    const link = screen.getByRole('link', {
      name: /view payment for Ada Lovelace on AH-001/i,
    });
    expect(link).toHaveAttribute('href', '/plans/plan-1?tab=payments#payment-pay-1');
    expect(link).toHaveTextContent(/view/i);
  });

  test('flags reversal rows with negative amount + ↩ marker', () => {
    render(
      <RecentActivityTable
        rows={[fakeRow({ id: 'pay-2', amountKobo: -5_000_000n as Kobo, isReversal: true })]}
      />,
    );
    // formatKobo renders the negative directly; the marker is a separate visual element
    expect(screen.getByText(/-₦50,000\.00/)).toBeInTheDocument();
    expect(screen.getByText('↩', { exact: false })).toBeInTheDocument();
  });
});
