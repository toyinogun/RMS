import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { toast } from 'sonner';
import { TempPasswordPanel } from '../temp-password-panel';

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe('TempPasswordPanel', () => {
  const mockEmail = 'user@example.com';
  const mockTempPassword = 'TempPass123!@#';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders email and password in the DOM', () => {
    render(<TempPasswordPanel email={mockEmail} tempPassword={mockTempPassword} />);

    expect(screen.getByText(mockEmail)).toBeInTheDocument();
    expect(screen.getByText(mockTempPassword)).toBeInTheDocument();
  });

  it('renders password in an element with font-mono class', () => {
    render(<TempPasswordPanel email={mockEmail} tempPassword={mockTempPassword} />);

    const passwordElement = screen.getByText(mockTempPassword);
    expect(passwordElement.className).toContain('font-mono');
  });

  it('copies password to clipboard on button click and shows success toast', async () => {
    const user = userEvent.setup();
    const writeTextMock = vi.fn().mockResolvedValue(undefined);

    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: writeTextMock },
      writable: true,
      configurable: true,
    });

    render(<TempPasswordPanel email={mockEmail} tempPassword={mockTempPassword} />);

    const copyButton = screen.getByRole('button', { name: /copy password/i });
    await user.click(copyButton);

    expect(writeTextMock).toHaveBeenCalledWith(mockTempPassword);
    expect(toast.success).toHaveBeenCalledWith('Password copied.');
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('shows error toast when clipboard is unavailable', async () => {
    const user = userEvent.setup();

    Object.defineProperty(navigator, 'clipboard', {
      value: undefined,
      writable: true,
      configurable: true,
    });

    render(<TempPasswordPanel email={mockEmail} tempPassword={mockTempPassword} />);

    const copyButton = screen.getByRole('button', { name: /copy password/i });
    await user.click(copyButton);

    expect(toast.error).toHaveBeenCalledWith(
      'Copy unavailable. Select the password and press Cmd/Ctrl+C.',
    );
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('has aria-live="polite" on the outer container', () => {
    const { container } = render(
      <TempPasswordPanel email={mockEmail} tempPassword={mockTempPassword} />,
    );

    const ariaLiveContainer = container.querySelector('[aria-live="polite"]');
    expect(ariaLiveContainer).toBeInTheDocument();
  });
});
