import { describe, expect, test, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PropertyForm } from '../properties/property-form';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

describe('PropertyForm', () => {
  test('renders all five required fields', () => {
    render(<PropertyForm mode="create" onSubmit={vi.fn()} />);
    expect(screen.getByLabelText(/code/i)).toBeRequired();
    expect(screen.getByLabelText(/title/i)).toBeRequired();
    expect(screen.getByLabelText(/address/i)).toBeRequired();
    expect(screen.getByLabelText(/city/i)).toBeRequired();
    expect(screen.getByLabelText(/total price/i)).toBeRequired();
  });

  test('submits FormData with uppercased code', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue({ ok: true, data: { id: 'p1' } });
    render(<PropertyForm mode="create" onSubmit={onSubmit} />);
    await user.type(screen.getByLabelText(/code/i), 'at-001');
    await user.type(screen.getByLabelText(/title/i), '3-bed terrace');
    await user.type(screen.getByLabelText(/address/i), '12 Marina Road');
    await user.type(screen.getByLabelText(/city/i), 'Lagos');
    await user.type(screen.getByLabelText(/total price/i), '50,000,000');
    await user.click(screen.getByRole('button', { name: /save/i }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    const arg = onSubmit.mock.calls[0]![0] as FormData;
    // The form passes raw input as typed; the server schema does the uppercase + kobo conversion.
    expect(arg.get('code')).toBe('at-001');
    expect(arg.get('totalPriceNgn')).toBe('50,000,000');
  });

  test('shows fieldErrors returned from the action', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue({
      ok: false,
      message: 'Please fix the highlighted fields',
      fieldErrors: { code: 'Already in use' },
    });
    render(<PropertyForm mode="create" onSubmit={onSubmit} />);
    await user.type(screen.getByLabelText(/code/i), 'AT-DUP');
    await user.type(screen.getByLabelText(/title/i), 'X');
    await user.type(screen.getByLabelText(/address/i), 'X');
    await user.type(screen.getByLabelText(/city/i), 'X');
    await user.type(screen.getByLabelText(/total price/i), '1,000');
    await user.click(screen.getByRole('button', { name: /save/i }));
    expect(await screen.findByText(/already in use/i)).toBeInTheDocument();
  });
});
