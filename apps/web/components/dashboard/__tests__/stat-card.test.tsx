import { describe, expect, test } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatCard } from '../stat-card';

describe('<StatCard />', () => {
  test('renders label and value; omits hint when not provided', () => {
    const { container } = render(<StatCard label="Active plans" value="7" />);
    expect(screen.getByText('Active plans')).toBeInTheDocument();
    expect(screen.getByText('7')).toBeInTheDocument();
    // No hint paragraph (hint uses text-xs; label uses text-sm)
    expect(container.querySelectorAll('.text-xs')).toHaveLength(0);
  });

  test('renders hint when provided', () => {
    render(<StatCard label="Overdue" value="3" hint="Past due and not yet paid" />);
    expect(screen.getByText('Past due and not yet paid')).toBeInTheDocument();
  });

  test('applies tone-specific color class to the value', () => {
    const { rerender } = render(<StatCard label="X" value="1" tone="warning" />);
    expect(screen.getByText('1')).toHaveClass('text-amber-600');

    rerender(<StatCard label="X" value="1" tone="success" />);
    expect(screen.getByText('1')).toHaveClass('text-emerald-600');

    rerender(<StatCard label="X" value="1" tone="destructive" />);
    expect(screen.getByText('1')).toHaveClass('text-destructive');

    rerender(<StatCard label="X" value="1" />);
    expect(screen.getByText('1')).toHaveClass('text-ink-900');
  });
});
