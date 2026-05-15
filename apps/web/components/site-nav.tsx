import Link from 'next/link';
import type { Route } from 'next';
import type { UserRole } from '@solutio/shared';
import { signOutAction } from '@/server-actions/sign-out';
import { cn } from '@/lib/utils';

type NavItem = { href: Route; label: string; ownerOnly?: boolean };

const ITEMS: NavItem[] = [
  { href: '/' as Route, label: 'Home' },
  { href: '/customers' as Route, label: 'Customers' },
  { href: '/properties' as Route, label: 'Properties' },
  { href: '/plans' as Route, label: 'Plans' },
  { href: '/users' as Route, label: 'Users', ownerOnly: true },
];

export interface SiteNavProps {
  currentPath: string;
  userEmail: string;
  role: UserRole;
}

export function SiteNav({ currentPath, userEmail, role }: SiteNavProps) {
  const visible = ITEMS.filter((item) => !item.ownerOnly || role === 'OWNER');

  return (
    <header className="sticky top-0 z-30 border-b border-paper-300 bg-paper-50">
      <nav className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3 sm:gap-6 sm:px-6">
        <Link
          href={'/' as Route}
          className="group flex flex-shrink-0 items-center gap-2 font-semibold tracking-[-0.01em] text-ink-900"
          aria-label="Solutio"
        >
          <span
            aria-hidden
            className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-clay-600 font-mono text-[13px] font-semibold text-paper-50 transition-colors group-hover:bg-clay-700"
          >
            §
          </span>
          <span className="hidden text-[15px] sm:inline">Solutio</span>
        </Link>

        <ol className="-mx-1 flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto px-1 text-sm sm:gap-1">
          {visible.map((item) => {
            const active = isActive(currentPath, item.href);
            return (
              <li key={item.href} className="flex-shrink-0">
                <Link
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'relative inline-flex items-center rounded-md px-3 py-1.5 font-medium transition-colors',
                    active
                      ? 'text-clay-600 sm:bg-transparent bg-clay-100'
                      : 'text-ink-700 hover:bg-paper-200 hover:text-ink-900',
                  )}
                >
                  {active && (
                    <span
                      aria-hidden
                      className="absolute left-2 right-2 -bottom-[10px] hidden h-[2px] rounded-full bg-clay-600 sm:block"
                    />
                  )}
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ol>

        <div className="hidden flex-shrink-0 items-center gap-3 text-ink-500 md:flex">
          <span className="text-[13px]">
            <span className="text-ink-500">Signed in as</span>{' '}
            <span className="font-medium text-ink-900">{userEmail}</span>
          </span>
          <form action={signOutAction}>
            <button
              type="submit"
              className="rounded-md px-2.5 py-1.5 text-sm text-ink-500 transition-colors hover:bg-paper-200 hover:text-ink-900 focus-visible:bg-paper-200 focus-visible:text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-clay-600/30"
            >
              Sign out
            </button>
          </form>
        </div>

        {/* Compact email + sign-out for narrow screens */}
        <form action={signOutAction} className="md:hidden">
          <button
            type="submit"
            aria-label={`Sign out ${userEmail}`}
            title={userEmail}
            className="rounded-md px-2 py-1.5 text-[13px] text-ink-500 transition-colors hover:bg-paper-200 hover:text-ink-900 focus-visible:bg-paper-200 focus-visible:text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-clay-600/30"
          >
            Sign out
          </button>
        </form>
      </nav>
    </header>
  );
}

function isActive(currentPath: string, href: Route): boolean {
  if (href === '/') return currentPath === '/';
  return currentPath === href || currentPath.startsWith(`${href}/`);
}
