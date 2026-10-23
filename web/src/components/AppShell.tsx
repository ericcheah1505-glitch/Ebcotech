'use client';

// Page frame: on phones a top title bar + bottom tabs (same as the phone app); on PCs a left menu.
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { useAuth } from '@/lib/auth';
import { APP_VERSION } from '@/lib/catalog';
import { cx, Loading } from './ui';

type NavItem = { href: string; label: string; icon: string; show: boolean };

function useNav() {
  const { user, settings } = useAuth();
  const role = user?.role;
  const isSales = role === 'salesman';
  const isAdmin = role === 'admin';
  const staff = isAdmin || isSales;
  const salesInstalled = settings.salesman_installed_report !== 'off';
  // Phone tabs: identical to the app (salesmen see "Installed" only when admin allows it).
  const tabs: NavItem[] = [
    { href: '/', label: 'Today', icon: '🗓', show: true },
    { href: '/jobs/', label: 'Jobs', icon: '🛠', show: true },
    { href: '/incentive/', label: isSales ? 'Installed' : 'Incentive', icon: isSales ? '🚪' : '💰', show: !isSales || salesInstalled },
    { href: '/more/', label: 'More', icon: '☰', show: true },
  ];
  // PC menu: everything one click away.
  const menu: NavItem[] = [
    { href: '/', label: isAdmin ? 'Dashboard' : 'Today', icon: '📊', show: true },
    { href: '/jobs/', label: 'Jobs', icon: '🛠', show: true },
    { href: '/incentive/', label: 'Incentive', icon: '💰', show: !isSales },
    { href: '/installed/', label: 'Installed models', icon: '🚪', show: !isSales || salesInstalled },
    { href: '/contracts/', label: 'Service contracts', icon: '📄', show: staff },
    { href: '/admin/staff/', label: 'Staff', icon: '👥', show: isAdmin },
    { href: '/admin/rates/', label: 'Job types & rates', icon: '💲', show: isAdmin },
    { href: '/admin/settings/', label: 'Settings', icon: '⚙', show: isAdmin },
    { href: '/change-password/', label: 'Change my password', icon: '🔑', show: true },
  ];
  return { tabs: tabs.filter((t) => t.show), menu: menu.filter((m) => m.show) };
}

const isActive = (pathname: string, href: string) => (href === '/' ? pathname === '/' : pathname.startsWith(href.replace(/\/$/, '')));

export function AppShell({ children }: { children: ReactNode }) {
  const { user, ready, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const { tabs, menu } = useNav();

  useEffect(() => {
    if (!ready) return;
    if (!user) router.replace('/login/');
    else if (user.must_change_password) router.replace('/change-password/');
  }, [ready, user, router]);

  if (!ready || !user || user.must_change_password) return <Loading />;

  return (
    <div className="flex min-h-dvh">
      {/* PC: left menu */}
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-line bg-white lg:flex">
        <div className="border-b border-line px-5 py-4">
          <img src="/company-logo.png" alt="EBCOTECH Machinery" className="w-40" />
          <div className="mt-1 text-[12px] text-muted">Job &amp; technician management</div>
        </div>
        <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-3">
          {menu.map((m) => (
            <Link
              key={m.href}
              href={m.href}
              className={cx(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-[14px] font-medium',
                isActive(pathname, m.href) ? 'bg-primary text-white' : 'text-ink hover:bg-bg'
              )}>
              <span className="w-5 text-center">{m.icon}</span>
              {m.label}
            </Link>
          ))}
        </nav>
        <div className="border-t border-line p-4 text-[13px]">
          <div className="font-semibold">{user.name}</div>
          <div className="text-muted">
            {user.role}
            {user.grade ? ` · ${user.grade}` : ''} · @{user.username}
          </div>
          <button type="button" onClick={() => confirm('Log out?') && logout()} className="mt-2 font-semibold text-danger">
            Log out
          </button>
          <div className="mt-2 text-[11px] text-muted">{APP_VERSION}</div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col pb-16 lg:pb-0">{children}</div>

      {/* Phone: bottom tabs, like the app */}
      <nav className="fixed inset-x-0 bottom-0 z-40 flex h-16 border-t border-line bg-white pb-[env(safe-area-inset-bottom)] lg:hidden">
        {tabs.map((t) => {
          const active = isActive(pathname, t.href) || (t.href === '/incentive/' && pathname.startsWith('/installed'));
          return (
            <Link key={t.href} href={t.href} className={cx('flex flex-1 flex-col items-center justify-center gap-0.5 text-[11px]', active ? 'text-primary' : 'text-muted')}>
              <span className={cx('text-[20px]', !active && 'grayscale opacity-60')}>{t.icon}</span>
              {t.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

// Title bar of a page. Phones: white bar like the app's header (with Back on inner pages).
// PCs: a page heading.
export function PageHeader({ title, pcTitle, back, right }: { title: string; pcTitle?: string; back?: boolean; right?: ReactNode }) {
  const router = useRouter();
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-line bg-white px-4 lg:static lg:h-auto lg:border-0 lg:bg-transparent lg:px-6 lg:pt-6 lg:pb-0">
      {back && (
        <button type="button" onClick={() => router.back()} className="-ml-1 flex items-center gap-1 text-[17px] text-primary">
          ‹ <span className="text-[15px]">Back</span>
        </button>
      )}
      <h1 className="min-w-0 flex-1 truncate text-[18px] font-bold lg:text-[24px]">
        <span className={pcTitle ? 'lg:hidden' : ''}>{title}</span>
        {pcTitle && <span className="hidden lg:inline">{pcTitle}</span>}
      </h1>
      {right}
    </header>
  );
}
