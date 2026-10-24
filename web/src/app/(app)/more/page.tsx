'use client';

import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import { APP_VERSION } from '@/lib/catalog';
import { PageHeader } from '@/components/AppShell';
import { Button, Card, Muted, Screen } from '@/components/ui';

export default function More() {
  const { user, logout } = useAuth();
  const staff = user?.role === 'admin' || user?.role === 'salesman';
  const links = [
    { title: 'Change my password', desc: 'Choose a password only you know', href: '/change-password/', show: true },
    { title: 'Warranty follow-up', desc: 'Customers whose warranty ends soon – offer servicing or a contract', href: '/warranty/', show: staff },
    { title: 'Service contracts', desc: 'Customers with scheduled servicing; jobs are auto-created before due date', href: '/contracts/', show: staff },
    { title: 'Job types & incentive rates', desc: 'Senior/junior rates, warranty months, extra situations (welding etc.)', href: '/admin/rates/', show: user?.role === 'admin' },
    { title: 'Settings', desc: 'What salesmen can see (Installed models report)', href: '/admin/settings/', show: user?.role === 'admin' },
    { title: 'Staff', desc: 'Add salesmen & technicians, set senior/junior grade', href: '/admin/staff/', show: user?.role === 'admin' },
  ];
  return (
    <>
      <PageHeader title="More" />
      <Screen>
        <Card>
          <span className="text-[18px] font-bold">{user?.name}</span>
          <Muted>
            {user?.role}
            {user?.grade ? ` · ${user.grade}` : ''} · @{user?.username}
          </Muted>
          <Muted>App version: {APP_VERSION}</Muted>
        </Card>
        {links
          .filter((l) => l.show)
          .map((l) => (
            <Link key={l.title} href={l.href}>
              <Card>
                <span className="text-[16px] font-bold text-ink">{l.title} ›</span>
                <Muted>{l.desc}</Muted>
              </Card>
            </Link>
          ))}
        <Button variant="danger" title="Log out" onPress={() => confirm('Log out?') && logout()} />
      </Screen>
    </>
  );
}
