import { describe, expect, test, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Hoisted mocks so vi.mock factories can reference them.
const {
  toastSuccessMock,
  toastErrorMock,
  deactivateUserActionMock,
  reactivateUserActionMock,
} = vi.hoisted(() => ({
  toastSuccessMock: vi.fn(),
  toastErrorMock: vi.fn(),
  deactivateUserActionMock: vi.fn(),
  reactivateUserActionMock: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: { success: toastSuccessMock, error: toastErrorMock },
}));

vi.mock('@/server-actions/users/deactivate', () => ({
  deactivateUserAction: deactivateUserActionMock,
}));

vi.mock('@/server-actions/users/reactivate', () => ({
  reactivateUserAction: reactivateUserActionMock,
}));

import { UserRowActions } from '../user-row-actions';
import type { UserListRow } from '@solutio/db';
import {
  M6_DEACTIVATE_CANNOT_DEACTIVATE_LAST_OWNER_MESSAGE,
} from '@/server-actions/users/messages';

function makeRow(overrides: Partial<UserListRow> = {}): UserListRow {
  return {
    id: 'user-42',
    name: 'Chidi Anagonye',
    email: 'chidi@example.com',
    role: 'STAFF',
    deactivatedAt: null,
    createdAt: new Date('2026-01-01'),
    ...overrides,
  } as UserListRow;
}

function renderActions(props: {
  row?: UserListRow;
  isSelf?: boolean;
  isLastActiveOwner?: boolean;
}) {
  const row = props.row ?? makeRow();
  render(
    <UserRowActions
      row={row}
      isSelf={props.isSelf ?? false}
      isLastActiveOwner={props.isLastActiveOwner ?? false}
    />,
  );
}

beforeEach(() => {
  toastSuccessMock.mockReset();
  toastErrorMock.mockReset();
  deactivateUserActionMock.mockReset();
  reactivateUserActionMock.mockReset();
});

describe('UserRowActions — self row', () => {
  test('renders nothing when isSelf is true', () => {
    const { container } = render(
      <UserRowActions row={makeRow()} isSelf isLastActiveOwner={false} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});

describe('UserRowActions — active non-self row', () => {
  test('shows Deactivate button', () => {
    renderActions({ isSelf: false });
    expect(screen.getByRole('button', { name: /deactivate/i })).toBeInTheDocument();
  });

  test('Deactivate button is not disabled for a non-last-owner', () => {
    renderActions({ isSelf: false, isLastActiveOwner: false });
    expect(screen.getByRole('button', { name: /deactivate/i })).not.toBeDisabled();
  });

  test('opens confirm dialog on Deactivate click', async () => {
    const user = userEvent.setup();
    renderActions({ isSelf: false, isLastActiveOwner: false });
    await user.click(screen.getByRole('button', { name: /deactivate/i }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText(/They will be signed out immediately/i)).toBeInTheDocument();
  });

  test('dialog title contains user name', async () => {
    const user = userEvent.setup();
    renderActions({ row: makeRow({ name: 'Chidi Anagonye' }), isSelf: false });
    await user.click(screen.getByRole('button', { name: /deactivate/i }));
    await screen.findByRole('dialog');
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Chidi Anagonye');
  });

  test('on successful deactivate: shows success toast and closes dialog', async () => {
    deactivateUserActionMock.mockResolvedValue({ ok: true, userId: 'user-42' });
    const user = userEvent.setup();
    renderActions({ isSelf: false });
    await user.click(screen.getByRole('button', { name: /deactivate/i }));
    await screen.findByRole('dialog');
    await user.click(screen.getByRole('button', { name: /confirm/i }));
    await waitFor(() => {
      expect(toastSuccessMock).toHaveBeenCalledWith('User deactivated.');
    });
    expect(toastErrorMock).not.toHaveBeenCalled();
  });

  test('on M6_CANNOT_DEACTIVATE_LAST_OWNER error: shows error toast and dialog stays open', async () => {
    deactivateUserActionMock.mockResolvedValue({
      ok: false,
      code: 'M6_CANNOT_DEACTIVATE_LAST_OWNER',
      message: M6_DEACTIVATE_CANNOT_DEACTIVATE_LAST_OWNER_MESSAGE,
    });
    const user = userEvent.setup();
    renderActions({ isSelf: false, isLastActiveOwner: false });
    await user.click(screen.getByRole('button', { name: /deactivate/i }));
    await screen.findByRole('dialog');
    await user.click(screen.getByRole('button', { name: /confirm/i }));
    await waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalledWith(M6_DEACTIVATE_CANNOT_DEACTIVATE_LAST_OWNER_MESSAGE);
    });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(toastSuccessMock).not.toHaveBeenCalled();
  });
});

describe('UserRowActions — active last-owner row', () => {
  test('Deactivate button is disabled', () => {
    renderActions({ isSelf: false, isLastActiveOwner: true });
    expect(screen.getByRole('button', { name: /deactivate/i })).toBeDisabled();
  });

  test('Deactivate button has title attribute explaining why', () => {
    renderActions({ isSelf: false, isLastActiveOwner: true });
    expect(screen.getByRole('button', { name: /deactivate/i })).toHaveAttribute(
      'title',
      'Cannot deactivate the last owner.',
    );
  });
});

describe('UserRowActions — deactivated row', () => {
  const deactivatedRow = makeRow({ deactivatedAt: new Date('2026-03-01') });

  test('shows Re-activate button', () => {
    renderActions({ row: deactivatedRow, isSelf: false });
    expect(screen.getByRole('button', { name: /re-activate/i })).toBeInTheDocument();
  });

  test('does not show Deactivate button', () => {
    renderActions({ row: deactivatedRow, isSelf: false });
    expect(screen.queryByRole('button', { name: /deactivate/i })).not.toBeInTheDocument();
  });

  test('opens confirm dialog on Re-activate click', async () => {
    const user = userEvent.setup();
    renderActions({ row: deactivatedRow, isSelf: false });
    await user.click(screen.getByRole('button', { name: /re-activate/i }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });

  test('on successful reactivate: shows success toast and closes dialog', async () => {
    reactivateUserActionMock.mockResolvedValue({ ok: true, userId: 'user-42' });
    const user = userEvent.setup();
    renderActions({ row: deactivatedRow, isSelf: false });
    await user.click(screen.getByRole('button', { name: /re-activate/i }));
    await screen.findByRole('dialog');
    await user.click(screen.getByRole('button', { name: /confirm/i }));
    await waitFor(() => {
      expect(toastSuccessMock).toHaveBeenCalledWith('User re-activated.');
    });
    expect(toastErrorMock).not.toHaveBeenCalled();
  });

  test('on reactivate error: shows error toast', async () => {
    reactivateUserActionMock.mockResolvedValue({
      ok: false,
      code: 'M6_NOT_FOUND',
      message: 'User not found.',
    });
    const user = userEvent.setup();
    renderActions({ row: deactivatedRow, isSelf: false });
    await user.click(screen.getByRole('button', { name: /re-activate/i }));
    await screen.findByRole('dialog');
    await user.click(screen.getByRole('button', { name: /confirm/i }));
    await waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalledWith('User not found.');
    });
    expect(toastSuccessMock).not.toHaveBeenCalled();
  });
});
