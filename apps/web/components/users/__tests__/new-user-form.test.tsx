import { describe, expect, test, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Hoisted mocks so vi.mock factories can reference them.
const { createUserActionMock } = vi.hoisted(() => ({
  createUserActionMock: vi.fn(),
}));

vi.mock('@/server-actions/users/create', () => ({
  createUserAction: createUserActionMock,
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

// next/link renders a plain anchor in tests.
vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

import { NewUserForm } from '../new-user-form';

beforeEach(() => {
  createUserActionMock.mockReset();
});

describe('NewUserForm — initial render', () => {
  test('renders name, email, and role fields', () => {
    render(<NewUserForm />);
    expect(screen.getByLabelText(/name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/role/i)).toBeInTheDocument();
  });

  test('role select defaults to STAFF', () => {
    render(<NewUserForm />);
    const select = screen.getByLabelText(/role/i) as HTMLSelectElement;
    expect(select.value).toBe('STAFF');
  });

  test('role select does not offer OWNER option', () => {
    render(<NewUserForm />);
    const options = screen
      .getAllByRole('option')
      .map((o) => (o as HTMLOptionElement).value);
    expect(options).not.toContain('OWNER');
    expect(options).toContain('STAFF');
    expect(options).toContain('ADMIN');
  });
});

describe('NewUserForm — success state', () => {
  test('swaps form for TempPasswordPanel on ok: true', async () => {
    createUserActionMock.mockResolvedValue({
      ok: true,
      userId: 'user-99',
      email: 'ada@example.com',
      tempPassword: 'S3cur3P@ss!',
    });

    const user = userEvent.setup();
    render(<NewUserForm />);

    await user.type(screen.getByLabelText(/name/i), 'Ada Lovelace');
    await user.type(screen.getByLabelText(/email/i), 'ada@example.com');
    await user.click(screen.getByRole('button', { name: /create user/i }));

    await waitFor(() => {
      expect(screen.queryByLabelText(/name/i)).not.toBeInTheDocument();
    });
    // TempPasswordPanel renders the temp password
    expect(screen.getByText('S3cur3P@ss!')).toBeInTheDocument();
    // "Back to users" link is present
    expect(screen.getByRole('link', { name: /back to users/i })).toHaveAttribute('href', '/users');
  });
});

describe('NewUserForm — error states', () => {
  test('shows top-level error banner when action returns ok: false without fieldErrors', async () => {
    createUserActionMock.mockResolvedValue({
      ok: false,
      code: 'M6_EMAIL_TAKEN',
      message: 'Email is already in use.',
    });

    const user = userEvent.setup();
    render(<NewUserForm />);

    await user.type(screen.getByLabelText(/name/i), 'Test User');
    await user.type(screen.getByLabelText(/email/i), 'taken@example.com');
    await user.click(screen.getByRole('button', { name: /create user/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Email is already in use.');
    });
    // Form fields still visible
    expect(screen.getByLabelText(/name/i)).toBeInTheDocument();
  });

  test('surfaces field errors inline when action returns fieldErrors', async () => {
    // Use a server-side error message that differs from Zod client messages.
    const serverFieldError = 'Email domain is not allowed.';
    createUserActionMock.mockResolvedValue({
      ok: false,
      code: 'M6_INVALID_INPUT',
      message: 'Validation failed.',
      fieldErrors: { email: serverFieldError },
    });

    const user = userEvent.setup();
    render(<NewUserForm />);

    // Use a valid email so client-side Zod validation passes and the action fires.
    await user.type(screen.getByLabelText(/name/i), 'Someone');
    await user.type(screen.getByLabelText(/email/i), 'someone@blocked.com');
    await user.click(screen.getByRole('button', { name: /create user/i }));

    await waitFor(() => {
      expect(screen.getByText(serverFieldError)).toBeInTheDocument();
    });
  });
});
