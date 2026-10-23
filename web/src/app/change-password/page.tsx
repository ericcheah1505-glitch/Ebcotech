'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { PageHeader } from '@/components/AppShell';
import { Button, Card, Field, Loading, Muted, Screen, Title } from '@/components/ui';

// Everyone chooses their own password. Shown automatically (and nothing else is available) when
// the person is still using a temporary password admin gave them.
export default function ChangePassword() {
  const { user, ready, passwordChanged, logout } = useAuth();
  const router = useRouter();
  const forced = !!user?.must_change_password;
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (ready && !user) router.replace('/login/');
  }, [ready, user, router]);
  if (!ready || !user) return <Loading />;

  const save = async () => {
    if (next.length < 6) return alert('Password must be at least 6 characters');
    if (next !== again) return alert('The two new passwords are not the same');
    setBusy(true);
    try {
      await api('/me/password', { body: { current_password: current, new_password: next } });
      passwordChanged();
      if (forced) return router.replace('/');
      alert('Password changed. Your other phones (if any) were logged out.');
      router.back();
    } catch (e: any) {
      alert(`Not changed\n${e.message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader title="Change password" back={!forced} />
      <Screen>
        <Card className="gap-3">
          <Title>{forced ? `Welcome, ${user.name}` : 'Change my password'}</Title>
          <Muted>
            {forced
              ? 'You are using a temporary password from admin. Choose your own password to continue – nobody else, including admin, will know it.'
              : 'Choose a password only you know. At least 6 characters.'}
          </Muted>
          <Field label={forced ? 'Temporary password' : 'Current password'} type="password" value={current} onChange={setCurrent} />
          <Field label="New password" type="password" value={next} onChange={setNext} />
          <Field label="New password again" type="password" value={again} onChange={setAgain} onEnter={save} />
          <Button title="Save new password" onPress={save} loading={busy} />
          {forced && <Button variant="secondary" title="Log out" onPress={logout} />}
        </Card>
      </Screen>
    </>
  );
}
