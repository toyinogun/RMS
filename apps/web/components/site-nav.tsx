import Link from 'next/link';
import type { Route } from 'next';
import type { UserRole } from '@solutio/shared';
import { signOutAction } from '@/server-actions/sign-out';

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
    <header className="border-b border-slate-200 bg-white">
      <nav className="mx-auto flex max-w-6xl items-center gap-6 px-6 py-3 text-sm">
        <ol className="flex items-center gap-4">
          {visible.map((item) => {
            const active = isActive(currentPath, item.href);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={
                    active
                      ? 'border-b-2 border-slate-900 pb-1 font-medium text-slate-900'
                      : 'text-slate-600 hover:text-slate-900'
                  }
                >
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ol>
        <div className="ml-auto flex items-center gap-3 text-slate-600">
          <span>
            Signed in as <span className="font-medium text-slate-900">{userEmail}</span>
          </span>
          <form action={signOutAction}>
            <button type="submit" className="text-slate-600 hover:text-slate-900">
              Sign out
            </button>
          </form>
        </div>
      </nav>
    </header>
  );
}

function isActive(currentPath: string, href: Route): boolean {
  if (href === '/') return currentPath === '/';
  return currentPath === href || currentPath.startsWith(`${href}/`);
}
