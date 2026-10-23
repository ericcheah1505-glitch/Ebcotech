'use client';

import { AppShell } from '@/components/AppShell';

// Every page after login: checks the login and draws the menu/tabs.
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
