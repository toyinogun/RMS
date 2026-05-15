'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

export interface MoneyInputProps
  extends Omit<React.ComponentProps<'input'>, 'type' | 'inputMode' | 'prefix'> {
  invalid?: boolean;
}

/**
 * The Money Cell as an input. Mono family, tabular nums, right-aligned digits,
 * ₦ prefix as a non-editable adornment inside the field.
 */
export const MoneyInput = React.forwardRef<HTMLInputElement, MoneyInputProps>(
  ({ className, invalid, disabled, readOnly, ...rest }, ref) => {
    return (
      <div
        className={cn(
          'group relative flex h-10 w-full items-center rounded-md border bg-paper-50 transition-colors',
          'border-paper-400',
          'focus-within:border-clay-600 focus-within:ring-[3px] focus-within:ring-clay-600/25',
          invalid && 'border-status-overdue ring-status-overdue/20 focus-within:ring-status-overdue/22',
          (disabled || readOnly) && 'bg-paper-100 text-ink-500',
          className,
        )}
      >
        <span
          aria-hidden
          className="select-none pl-3 pr-1 font-mono text-[15px] font-medium text-ink-500"
        >
          ₦
        </span>
        <input
          ref={ref}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          aria-invalid={invalid || undefined}
          disabled={disabled}
          readOnly={readOnly}
          data-money
          className={cn(
            'h-full w-full rounded-r-md bg-transparent pr-3 text-right text-[15px] font-medium text-ink-900 outline-none placeholder:text-ink-300',
            'disabled:cursor-not-allowed read-only:cursor-default',
          )}
          {...rest}
        />
      </div>
    );
  },
);

MoneyInput.displayName = 'MoneyInput';
