'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { APP_VERSION, COMPANY_NAME } from '@/lib/catalog';
import { Button, Card, Field } from '@/components/ui';

export default function Login() {
  const { login, notice, user, ready } = useAuth();
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (ready && user) router.replace(user.must_change_password ? '/change-password/' : '/');
  }, [ready, user, router]);

  const submit = async () => {
    if (!username || !password) return alert('Please fill in all fields');
    setBusy(true);
    try {
      await login(username.trim(), password);
    } catch (e: any) {
      alert(`Login failed\n${e.message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-[440px] flex-col gap-3 p-4 pt-[76px]">
      <img src="/company-logo.png" alt="" className="mx-auto hidden w-48 lg:block" />
      <div className="text-center text-[26px] font-extrabold text-ink">{COMPANY_NAME}</div>
      <div className="text-center text-muted">Job &amp; technician management</div>
      <div className="mb-3 text-center text-[12px] text-muted">{APP_VERSION}</div>
      {notice ? (
        <Card className="border border-warn">
          <span className="text-warn">{notice}</span>
        </Card>
      ) : null}
      <Card className="gap-3">
        <Field label="Username" value={username} onChange={(t) => setUsername(t.trim())} autoCapitalize="none" />
        <Field label="Password" type="password" value={password} onChange={setPassword} onEnter={submit} />
        <Button title="Log in" onPress={submit} loading={busy} />
      </Card>
    </div>
  );
}
