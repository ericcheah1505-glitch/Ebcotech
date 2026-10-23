'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { Grade, Role, User } from '@/lib/types';
import { PageHeader } from '@/components/AppShell';
import { Button, Card, Chips, cx, Field, Muted, Screen, Title, Toggle } from '@/components/ui';

const ROLES = [
  { value: 'technician', label: 'Technician' },
  { value: 'salesman', label: 'Salesman' },
  { value: 'admin', label: 'Admin' },
];
const GRADES = [
  { value: 'senior', label: 'Senior' },
  { value: 'junior', label: 'Junior' },
];

type Form = { id?: number; name: string; username: string; password: string; role: Role; grade: Grade; phone: string; active: boolean };
const blank: Form = { name: '', username: '', password: '', role: 'technician', grade: 'junior', phone: '', active: true };
type OpenJob = { id: number; job_no: string; customer_name: string };

// Someone leaving: their unfinished jobs and a one-step move to another person.
function OpenJobs({ person, users, onJobs }: { person: Form; users: User[]; onJobs: (n: number) => void }) {
  const [jobs, setJobs] = useState<OpenJob[] | null>(null);
  const [to, setTo] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const isTech = person.role === 'technician';

  const load = useCallback(async () => {
    const list = await api<{ jobs: OpenJob[] }>(`/users/${person.id}/open-jobs`)
      .then((r) => r.jobs)
      .catch(() => []);
    setJobs(list);
    onJobs(list.length);
  }, [person.id, onJobs]);
  useEffect(() => {
    load();
  }, [load]);

  if (!jobs) return null;
  const targets = users.filter((u) => u.active && u.id !== person.id && (isTech ? u.role === 'technician' : u.role === 'salesman' || u.role === 'admin'));
  const target = targets.find((u) => u.id === to);

  const move = async () => {
    if (!confirm(`Move ${jobs.length} job(s) to ${target?.name}?`)) return;
    setBusy(true);
    try {
      const r = await api<{ moved: number }>(`/users/${person.id}/move-open-jobs`, { body: { to_user_id: to } });
      alert(`${r.moved} job(s) moved to ${target?.name}.`);
      setTo(null);
      await load();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="gap-2">
      <Title>Open jobs ({jobs.length})</Title>
      {jobs.length === 0 ? (
        <Muted>No unfinished jobs – nothing to hand over.</Muted>
      ) : (
        <>
          <Muted>
            {isTech
              ? 'Jobs not yet reported by this technician. Jobs they already submitted stay with them (their work, their incentive).'
              : 'Unfinished jobs where this person is the salesman.'}
          </Muted>
          {jobs.slice(0, 8).map((j) => (
            <Muted key={j.id}>
              {j.job_no} · {j.customer_name}
            </Muted>
          ))}
          {jobs.length > 8 && <Muted>…and {jobs.length - 8} more</Muted>}
          <Chips label="Move all to" options={targets.map((u) => ({ value: u.id, label: u.name }))} value={to} onChange={setTo} />
          <Button title={target ? `Move ${jobs.length} job(s) to ${target.name}` : 'Choose who takes over'} disabled={!target} loading={busy} onPress={move} />
        </>
      )}
    </Card>
  );
}

export default function Staff() {
  const [users, setUsers] = useState<User[]>([]);
  const [form, setForm] = useState<Form | null>(null);
  const [busy, setBusy] = useState(false);
  const [openCount, setOpenCount] = useState(0);

  const load = useCallback(() => {
    api<User[]>('/users')
      .then(setUsers)
      .catch((e) => alert(e.message));
  }, []);
  useEffect(load, [load]);

  const doSave = async () => {
    if (!form) return;
    setBusy(true);
    try {
      const body = { ...form, password: form.password || undefined };
      await api(form.id ? `/users/${form.id}` : '/users', { method: form.id ? 'PUT' : 'POST', body });
      setForm(null);
      load();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setBusy(false);
    }
  };

  const save = () => {
    if (!form) return;
    const wasActive = !!users.find((u) => u.id === form.id)?.active;
    if (form.id && wasActive && !form.active && openCount > 0) {
      if (!confirm(`${form.name} still has ${openCount} open job(s).\nMove them to someone else first (Open jobs, below)?\nPress OK to deactivate anyway.`)) return;
    }
    doSave();
  };

  const logoutAll = async () => {
    if (!form?.id || !confirm(`Log out ${form.name} everywhere?\nUse this for a lost or stolen phone. They can log in again on their new phone.`)) return;
    try {
      const r = await api<{ logged_out: number }>(`/users/${form.id}/logout-all`, { method: 'POST' });
      alert(`${form.name} was logged out of ${r.logged_out} phone(s).`);
    } catch (e: any) {
      alert(e.message);
    }
  };

  const edit = (u: User) => setForm({ id: u.id, name: u.name, username: u.username, password: '', role: u.role, grade: u.grade ?? 'junior', phone: u.phone ?? '', active: !!u.active });

  if (form) {
    const set = (p: Partial<Form>) => setForm({ ...form, ...p });
    return (
      <>
        <PageHeader title="Staff" back />
        <Screen>
          <Title>{form.id ? `Edit ${form.name}` : 'New staff'}</Title>
          <Field label="Full name" value={form.name} onChange={(v) => set({ name: v })} />
          {!form.id && <Field label="Username (for login)" value={form.username} onChange={(v) => set({ username: v })} autoCapitalize="none" />}
          <Field label={form.id ? 'Reset password (leave blank to keep)' : 'Temporary password'} type="password" value={form.password} onChange={(v) => set({ password: v })} />
          <Muted>Temporary – at their next login they must choose their own password, which admin won&apos;t know. At least 6 characters.</Muted>
          <Field label="Phone" type="tel" value={form.phone} onChange={(v) => set({ phone: v })} />
          <Chips label="Role" options={ROLES} value={form.role} onChange={(v) => set({ role: v })} />
          {form.role === 'technician' && (
            <>
              <Chips label="Grade (decides incentive rate)" options={GRADES} value={form.grade} onChange={(v) => set({ grade: v })} />
              <Muted>Changing grade only affects jobs completed from now on.</Muted>
            </>
          )}
          {form.id && (
            <div className="flex items-center justify-between">
              <span className="text-[16px]">Active (can log in)</span>
              <Toggle value={form.active} onChange={(v) => set({ active: v })} />
            </div>
          )}
          <Button title="Save" onPress={save} loading={busy} />
          {form.id && <OpenJobs person={form} users={users} onJobs={setOpenCount} />}
          {form.id && <Button variant="danger" title="Log out all phones" onPress={logoutAll} />}
          <Button variant="secondary" title="Cancel" onPress={() => setForm(null)} />
        </Screen>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Staff" back />
      <Screen wide>
        <Button title="+ Add staff" onPress={() => setForm(blank)} className="lg:max-w-xs" />
        {/* Phone: cards as in the app */}
        <div className="flex flex-col gap-3 lg:hidden">
          {users.map((u) => (
            <button type="button" key={u.id} className="text-left" onClick={() => edit(u)}>
              <Card className={cx(!u.active && 'opacity-50')}>
                <span className="text-[16px] font-bold text-ink">{u.name}</span>
                <Muted>
                  {u.role}
                  {u.grade ? ` · ${u.grade}` : ''} · @{u.username}
                  {u.active ? '' : ' · inactive'}
                  {u.active && u.must_change_password ? ' · temporary password' : ''}
                </Muted>
              </Card>
            </button>
          ))}
        </div>
        {/* PC: table */}
        <div className="hidden overflow-hidden rounded-xl border-[0.5px] border-line bg-white lg:block">
          <table className="w-full text-[14px]">
            <thead className="bg-navy text-left text-white">
              <tr>
                {['Name', 'Username', 'Role', 'Grade', 'Phone', 'Status'].map((h) => (
                  <th key={h} className="px-4 py-2 font-semibold">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} onClick={() => edit(u)} className={cx('cursor-pointer border-t border-line hover:bg-[#eef3ff]', !u.active && 'text-muted')}>
                  <td className="px-4 py-2.5 font-semibold">{u.name}</td>
                  <td className="px-4 py-2.5">@{u.username}</td>
                  <td className="px-4 py-2.5 capitalize">{u.role}</td>
                  <td className="px-4 py-2.5 capitalize">{u.grade ?? ''}</td>
                  <td className="px-4 py-2.5">{u.phone ?? ''}</td>
                  <td className="px-4 py-2.5">{!u.active ? 'Inactive' : u.must_change_password ? 'Temporary password' : 'Active'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Screen>
    </>
  );
}
