import { describe, expect, test, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { UsersTable } from '../users-table';
import type { UserListRow } from '@solutio/db';

// UserRowActions is a client component that uses server actions and dialogs;
// it is covered in its own test file. We stub it here to keep users-table tests focused.
vi.mock('../user-row-actions', () => ({
  UserRowActions: ({ isSelf, isLastActiveOwner }: { isSelf: boolean; isLastActiveOwner: boolean }) => (
    <span data-testid="row-actions" data-is-self={String(isSelf)} data-is-last-owner={String(isLastActiveOwner)} />
  ),
}));

const BASE_DATE = new Date('2026-01-15T00:00:00.000Z');

function makeRow(overrides: Partial<UserListRow> = {}): UserListRow {
  return {
    id: 'user-1',
    name: 'Alice Example',
    email: 'alice@example.com',
    role: 'STAFF',
    deactivatedAt: null,
    createdAt: BASE_DATE,
    ...overrides,
  } as UserListRow;
}

function renderTable(
  rows: UserListRow[],
  currentUserId = 'user-1',
  lastActiveOwnerId: string | null = null,
) {
  render(
    <UsersTable
      rows={rows}
      currentUserId={currentUserId}
      lastActiveOwnerId={lastActiveOwnerId}
    />,
  );
}

describe('UsersTable', () => {
  test('renders column headers', () => {
    renderTable([]);
    expect(screen.getByText('Name')).toBeInTheDocument();
    expect(screen.getByText('Email')).toBeInTheDocument();
    expect(screen.getByText('Role')).toBeInTheDocument();
    expect(screen.getByText('Status')).toBeInTheDocument();
    expect(screen.getByText('Created')).toBeInTheDocument();
    expect(screen.getByText('Actions')).toBeInTheDocument();
  });

  test('renders a row with user data', () => {
    const row = makeRow({ name: 'Bob Builder', email: 'bob@example.com', role: 'ADMIN' });
    renderTable([row]);
    expect(screen.getByText('Bob Builder')).toBeInTheDocument();
    expect(screen.getByText('bob@example.com')).toBeInTheDocument();
    expect(screen.getByText('ADMIN')).toBeInTheDocument();
  });

  test('active user shows Active badge', () => {
    renderTable([makeRow({ deactivatedAt: null })]);
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.queryByText('Deactivated')).not.toBeInTheDocument();
  });

  test('deactivated user shows Deactivated badge', () => {
    renderTable([makeRow({ deactivatedAt: new Date('2026-03-01') })]);
    expect(screen.getByText('Deactivated')).toBeInTheDocument();
    expect(screen.queryByText('Active')).not.toBeInTheDocument();
  });

  test('renders multiple rows', () => {
    const rows = [
      makeRow({ id: 'user-1', name: 'Alice' }),
      makeRow({ id: 'user-2', name: 'Bob', email: 'bob@example.com' }),
    ];
    renderTable(rows);
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
  });

  test('passes isSelf=true for the current user row', () => {
    const rows = [
      makeRow({ id: 'me', name: 'Myself' }),
      makeRow({ id: 'other', name: 'Other', email: 'other@example.com' }),
    ];
    renderTable(rows, 'me');
    const actions = screen.getAllByTestId('row-actions');
    expect(actions[0]).toHaveAttribute('data-is-self', 'true');
    expect(actions[1]).toHaveAttribute('data-is-self', 'false');
  });

  test('passes isLastActiveOwner=true for the last active owner', () => {
    const rows = [
      makeRow({ id: 'owner-1', name: 'Owner', role: 'OWNER' }),
      makeRow({ id: 'staff-1', name: 'Staff', email: 'staff@example.com' }),
    ];
    renderTable(rows, 'other', 'owner-1');
    const actions = screen.getAllByTestId('row-actions');
    expect(actions[0]).toHaveAttribute('data-is-last-owner', 'true');
    expect(actions[1]).toHaveAttribute('data-is-last-owner', 'false');
  });

  test('renders createdAt as a locale date string', () => {
    const row = makeRow({ createdAt: new Date('2026-01-15T00:00:00.000Z') });
    renderTable([row]);
    const formatted = new Date('2026-01-15T00:00:00.000Z').toLocaleDateString();
    expect(screen.getByText(formatted)).toBeInTheDocument();
  });
});
