import { describe, expect, test, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SiteNav } from '../site-nav';

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    ...rest
  }: { href: string; children: React.ReactNode } & Record<string, unknown>) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock('@/server-actions/sign-out', () => ({
  signOutAction: vi.fn(),
}));

describe('SiteNav', () => {
  test('renders the five phase-1a links for OWNER', () => {
    render(<SiteNav currentPath="/" userEmail="owner@atrium.example" role="OWNER" />);
    expect(screen.getByRole('link', { name: /home/i })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: /customers/i })).toHaveAttribute('href', '/customers');
    expect(screen.getByRole('link', { name: /properties/i })).toHaveAttribute(
      'href',
      '/properties',
    );
    expect(screen.getByRole('link', { name: /plans/i })).toHaveAttribute('href', '/plans');
    expect(screen.getByRole('link', { name: /users/i })).toHaveAttribute('href', '/users');
  });

  test('hides Users link from non-OWNER roles', () => {
    render(<SiteNav currentPath="/" userEmail="staff@atrium.example" role="STAFF" />);
    expect(screen.queryByRole('link', { name: /users/i })).toBeNull();
  });

  test('marks the current section as active via aria-current', () => {
    render(
      <SiteNav currentPath="/customers/new" userEmail="owner@atrium.example" role="OWNER" />,
    );
    expect(screen.getByRole('link', { name: /customers/i })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('link', { name: /plans/i })).not.toHaveAttribute('aria-current');
  });

  test('treats / as active only for the exact root', () => {
    render(<SiteNav currentPath="/customers" userEmail="owner@atrium.example" role="OWNER" />);
    expect(screen.getByRole('link', { name: /home/i })).not.toHaveAttribute('aria-current');
  });

  test('renders the signed-in email', () => {
    render(<SiteNav currentPath="/" userEmail="owner@atrium.example" role="OWNER" />);
    expect(screen.getByText(/owner@atrium\.example/)).toBeInTheDocument();
  });
});
