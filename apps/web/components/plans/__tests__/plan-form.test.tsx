import { describe, expect, test, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const { createPlanActionMock } = vi.hoisted(() => ({ createPlanActionMock: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock('@/server-actions/plans/create', () => ({
  createPlanAction: createPlanActionMock,
}));
vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

import { PlanForm } from '../plan-form';

const customers = [
  { id: '550e8400-e29b-41d4-a716-446655440001', fullName: 'Adaeze Okafor', phone: '+2348012345001' },
];
const properties = [
  {
    id: '550e8400-e29b-41d4-a716-446655440002',
    code: 'UNIT-001',
    title: 'Block A',
    addressLine: '1 Test St',
    totalPriceKobo: 500_000_000n as never,
  },
];

beforeEach(() => {
  createPlanActionMock.mockReset();
});

describe('PlanForm', () => {
  test('defaults to existing-customer mode and shows the customer picker', () => {
    render(<PlanForm customers={customers} properties={properties} />);
    expect(screen.getByLabelText(/pick customer/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/^full name$/i)).toBeNull();
  });

  test('toggling to new-customer mode reveals the customer fields', async () => {
    render(<PlanForm customers={customers} properties={properties} />);
    await userEvent.click(screen.getByLabelText(/new customer/i));
    expect(screen.getByLabelText(/^full name$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^phone$/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/pick customer/i)).toBeNull();
  });

  test('renders the disabled deposit toggle with the M4 hint', () => {
    render(<PlanForm customers={customers} properties={properties} />);
    const toggle = screen.getByLabelText(/deposit received now/i) as HTMLInputElement;
    expect(toggle.disabled).toBe(true);
    expect(screen.getByText(/will be enabled in m4/i)).toBeInTheDocument();
  });

  test('calls createPlanAction with the assembled FormData on submit', async () => {
    createPlanActionMock.mockResolvedValue({ ok: true, data: { id: 'plan-1' } });
    render(<PlanForm customers={customers} properties={properties} />);

    await userEvent.type(screen.getByLabelText(/total price/i), '5,000,000');
    // depositNgn defaults to '0' — leave it
    await userEvent.type(screen.getByLabelText(/monthly/i), '200,000');
    fireEvent.submit(screen.getByRole('button', { name: /create plan/i }).closest('form')!);

    await vi.waitFor(() => expect(createPlanActionMock).toHaveBeenCalled());
    const fd = createPlanActionMock.mock.calls[0]![1] as FormData;
    expect(fd.get('customerMode')).toBe('existing');
    expect(fd.get('customerId')).toBe(customers[0]!.id);
    expect(fd.get('propertyId')).toBe(properties[0]!.id);
    expect(fd.get('totalPriceNgn')).toBe('5,000,000');
    expect(fd.get('depositReceived')).toBe('false');
  });
});
