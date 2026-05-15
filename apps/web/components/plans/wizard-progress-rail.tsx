'use client';

import * as React from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface WizardStep {
  key: string;
  title: string;
}

interface WizardProgressRailProps {
  steps: WizardStep[];
  currentIndex: number;
  onJumpTo?: (index: number) => void;
}

export function WizardProgressRail({ steps, currentIndex, onJumpTo }: WizardProgressRailProps) {
  return (
    <>
      {/* Desktop: numbered rail with titles */}
      <ol
        className="hidden items-center gap-1 border-b border-paper-300 px-6 py-4 sm:flex"
        role="list"
        aria-label="Wizard progress"
      >
        {steps.map((step, i) => {
          const status: 'done' | 'current' | 'upcoming' =
            i < currentIndex ? 'done' : i === currentIndex ? 'current' : 'upcoming';
          const isJumpable = onJumpTo && i < currentIndex;
          return (
            <li key={step.key} className="flex flex-1 items-center gap-1">
              <button
                type="button"
                onClick={isJumpable ? () => onJumpTo(i) : undefined}
                disabled={!isJumpable}
                aria-current={status === 'current' ? 'step' : undefined}
                className={cn(
                  'group flex flex-1 items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm transition-colors',
                  isJumpable && 'hover:bg-paper-200 focus-visible:bg-paper-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-clay-600/30',
                  !isJumpable && 'cursor-default',
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    'inline-flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full font-mono text-[12px] font-semibold transition-colors',
                    status === 'done' && 'bg-ink-900 text-paper-50',
                    status === 'current' && 'bg-clay-600 text-paper-50',
                    status === 'upcoming' && 'border border-paper-400 text-ink-300',
                  )}
                >
                  {status === 'done' ? <Check className="h-3 w-3" strokeWidth={3} /> : i + 1}
                </span>
                <span
                  className={cn(
                    'whitespace-nowrap font-medium tracking-[-0.005em]',
                    status === 'done' && 'text-ink-700',
                    status === 'current' && 'text-ink-900',
                    status === 'upcoming' && 'text-ink-300',
                  )}
                >
                  {step.title}
                </span>
              </button>
              {i < steps.length - 1 && (
                <span
                  aria-hidden
                  className={cn(
                    'h-px flex-1 transition-colors',
                    i < currentIndex ? 'bg-ink-700' : 'bg-paper-300',
                  )}
                />
              )}
            </li>
          );
        })}
      </ol>

      {/* Mobile: compact "Step N of M — Title" + dot indicator */}
      <div className="flex items-center justify-between border-b border-paper-300 px-4 py-3 sm:hidden">
        <div className="flex flex-col">
          <span className="font-mono text-[11px] font-medium uppercase tracking-[0.04em] text-ink-500">
            Step {currentIndex + 1} of {steps.length}
          </span>
          <span className="text-base font-semibold tracking-[-0.005em] text-ink-900">
            {steps[currentIndex]?.title}
          </span>
        </div>
        <div className="flex items-center gap-1.5" aria-hidden>
          {steps.map((step, i) => (
            <span
              key={step.key}
              className={cn(
                'h-1.5 rounded-full transition-all',
                i < currentIndex && 'w-1.5 bg-ink-700',
                i === currentIndex && 'w-6 bg-clay-600',
                i > currentIndex && 'w-1.5 bg-paper-300',
              )}
            />
          ))}
        </div>
      </div>
    </>
  );
}
