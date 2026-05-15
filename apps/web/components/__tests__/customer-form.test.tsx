import { describe, expect, test, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CustomerForm } from '../customers/customer-form';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

describe('CustomerForm', () => {
  test('renders Full name and Phone as required fields', () => {
    render(<CustomerForm mode="create" onSubmit={vi.fn()} />);
    expect(screen.getByLabelText(/full name/i)).toBeRequired();
    expect(screen.getByLabelText(/phone/i)).toBeRequired();
  });

  test('shows the inline-friendly variant when variant=inline', () => {
    render(<CustomerForm mode="create" onSubmit={vi.fn()} variant="inline" />);
    // Inline variant omits "Cancel" link in favour of caller-supplied controls.
    expect(screen.queryByRole('link', { name: /cancel/i })).toBeNull();
  });

  test('blocks submit and shows field errors when fullName is empty', async () => {
    const onSubmit = vi.fn();
    render(<CustomerForm mode="create" onSubmit={onSubmit} />);
    await userEvent.click(screen.getByRole('button', { name: /save/i }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(await screen.findByText(/required/i)).toBeInTheDocument();
  });

  test('submits typed values when valid', async () => {
    const onSubmit = vi.fn().mockResolvedValue({ ok: true, data: { id: 'x' } });
    render(<CustomerForm mode="create" onSubmit={onSubmit} />);
    await userEvent.type(screen.getByLabelText(/full name/i), 'Adaeze Okafor');
    await userEvent.type(screen.getByLabelText(/phone/i), '+2348012345001');
    await userEvent.click(screen.getByRole('button', { name: /save/i }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    const arg = onSubmit.mock.calls[0]![0] as FormData;
    expect(arg.get('fullName')).toBe('Adaeze Okafor');
    expect(arg.get('phone')).toBe('+2348012345001');
  });

  test('edit mode: submits with id appended and does not block on missing id field', async () => {
    const initial = {
      id: '019e2be6-0000-7000-8000-000000000001',
      fullName: 'Original Name',
      phone: '+2348011111111',
      email: null,
      nationalId: null,
      notes: null,
    };
    const onSubmit = vi.fn().mockResolvedValue({ ok: true, data: { id: initial.id } });
    render(<CustomerForm mode="edit" onSubmit={onSubmit} initial={initial} />);

    // Clear the phone field and type a new value
    const phoneInput = screen.getByLabelText(/^phone/i);
    await userEvent.clear(phoneInput);
    await userEvent.type(phoneInput, '+2348099999999');

    await userEvent.click(screen.getByRole('button', { name: /save/i }));

    // The form should submit — zodResolver should not block because id is
    // not a registered form field (it's appended separately after validation).
    expect(onSubmit).toHaveBeenCalledTimes(1);
    const arg = onSubmit.mock.calls[0]![0] as FormData;
    expect(arg.get('fullName')).toBe('Original Name');
    expect(arg.get('phone')).toBe('+2348099999999');
    // id is appended by the form handler for edit mode
    expect(arg.get('id')).toBe(initial.id);
  });
});
