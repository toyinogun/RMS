interface StatCardProps {
  label: string;
  value: string;
  hint?: string;
  tone?: 'default' | 'warning' | 'success' | 'destructive';
  testId?: string;
}

const TONE_CLASSES: Record<NonNullable<StatCardProps['tone']>, string> = {
  default: 'text-ink-900',
  warning: 'text-amber-600',
  success: 'text-emerald-600',
  destructive: 'text-destructive',
};

/**
 * Labelled stat tile for the home dashboard. Renders a small label, a large
 * pre-formatted value, and an optional hint. The `tone` prop colorizes the
 * value to indicate semantic state (e.g. warning for overdue counts).
 *
 * The caller is responsible for formatting `value` — pass `formatKobo(...)`
 * for money or `.toString()` for counts. `tabular-nums` keeps values aligned
 * when multiple cards are placed in a horizontal grid.
 *
 * `testId` is optional and renders as `data-testid` on the outer container so
 * E2E tests can address a single card unambiguously (label text alone is too
 * loose — every ancestor div "has" the label text).
 */
export function StatCard({ label, value, hint, tone = 'default', testId }: StatCardProps) {
  return (
    <div
      className="rounded-lg border border-paper-300 bg-paper-50 p-5"
      data-testid={testId}
    >
      <div className="text-sm text-ink-500">{label}</div>
      <div className={`text-3xl font-semibold tabular-nums ${TONE_CLASSES[tone]}`}>{value}</div>
      {hint ? <div className="mt-1 text-xs text-ink-500">{hint}</div> : null}
    </div>
  );
}
