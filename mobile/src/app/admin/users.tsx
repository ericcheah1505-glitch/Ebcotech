import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, Switch, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { api } from '@/lib/api';
import type { Grade, Role, User } from '@/lib/types';
import { Button, C, Card, Chips, Field, Muted, Screen, Title } from '@/components/ui';

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

  const fetchJobs = useCallback(() => api<{ jobs: OpenJob[] }>(`/users/${person.id}/open-jobs`).then((r) => r.jobs), [person.id]);
  const show = useCallback(
    (list: OpenJob[]) => {
      setJobs(list);
      onJobs(list.length);
    },
    [onJobs]
  );
  const load = async () => show(await fetchJobs().catch(() => []));
  useEffect(() => {
    let alive = true;
    fetchJobs()
      .catch(() => [])
      .then((list) => alive && show(list));
    return () => {
      alive = false;
    };
  }, [fetchJobs, show]);

  if (!jobs) return null;
  const targets = users.filter(
    (u) => u.active && u.id !== person.id && (isTech ? u.role === 'technician' : u.role === 'salesman' || u.role === 'admin')
  );
  const target = targets.find((u) => u.id === to);

  const move = () =>
    Alert.alert(`Move ${jobs.length} job(s) to ${target?.name}?`, '', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Move',
        onPress: async () => {
          setBusy(true);
          try {
            const r = await api<{ moved: number }>(`/users/${person.id}/move-open-jobs`, { body: { to_user_id: to } });
            Alert.alert('Done', `${r.moved} job(s) moved to ${target?.name}.`);
            setTo(null);
            await load();
          } catch (e: any) {
            Alert.alert('Error', e.message);
          } finally {
            setBusy(false);
          }
        },
      },
    ]);

  return (
    <Card style={{ gap: 8 }}>
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

export default function Users() {
  const [users, setUsers] = useState<User[]>([]);
  const [form, setForm] = useState<Form | null>(null);
  const [busy, setBusy] = useState(false);
  const [openCount, setOpenCount] = useState(0);

  const load = useCallback(() => {
    api<User[]>('/users').then(setUsers).catch((e) => Alert.alert('Error', e.message));
  }, []);
  useFocusEffect(load);

  const save = async () => {
    if (!form) return;
    const wasActive = !!users.find((u) => u.id === form.id)?.active;
    if (form.id && wasActive && !form.active && openCount > 0) {
      return Alert.alert(`${form.name} still has ${openCount} open job(s)`, 'Move them to someone else first (Open jobs, below), or deactivate anyway.', [
        { text: 'Go back', style: 'cancel' },
        { text: 'Deactivate anyway', style: 'destructive', onPress: () => doSave() },
      ]);
    }
    doSave();
  };

  const doSave = async () => {
    if (!form) return;
    setBusy(true);
    try {
      const body = { ...form, password: form.password || undefined };
      await api(form.id ? `/users/${form.id}` : '/users', { method: form.id ? 'PUT' : 'POST', body });
      setForm(null);
      load();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setBusy(false);
    }
  };

  if (form) {
    const set = (p: Partial<Form>) => setForm({ ...form, ...p });
    return (
      <Screen>
        <Title>{form.id ? `Edit ${form.name}` : 'New staff'}</Title>
        <Field label="Full name" value={form.name} onChangeText={(v) => set({ name: v })} />
        {!form.id && <Field label="Username (for login)" value={form.username} onChangeText={(v) => set({ username: v })} autoCapitalize="none" />}
        <Field
          label={form.id ? 'Reset password (leave blank to keep)' : 'Temporary password'}
          value={form.password}
          onChangeText={(v) => set({ password: v })}
          secureTextEntry
        />
        <Muted>Temporary – at their next login they must choose their own password, which admin won&apos;t know. At least 6 characters.</Muted>
        <Field label="Phone" value={form.phone} onChangeText={(v) => set({ phone: v })} keyboardType="phone-pad" />
        <Chips label="Role" options={ROLES} value={form.role} onChange={(v) => set({ role: v })} />
        {form.role === 'technician' && (
          <>
            <Chips label="Grade (decides incentive rate)" options={GRADES} value={form.grade} onChange={(v) => set({ grade: v })} />
            <Muted>Changing grade only affects jobs completed from now on.</Muted>
          </>
        )}
        {form.id && (
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ fontSize: 16 }}>Active (can log in)</Text>
            <Switch value={form.active} onValueChange={(v) => set({ active: v })} />
          </View>
        )}
        <Button title="Save" onPress={save} loading={busy} />
        {form.id && <OpenJobs person={form} users={users} onJobs={setOpenCount} />}
        {form.id && (
          <Button
            variant="danger"
            title="Log out all phones"
            onPress={() =>
              Alert.alert(`Log out ${form.name} everywhere?`, 'Use this for a lost or stolen phone. They can log in again on their new phone.', [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Log out',
                  style: 'destructive',
                  onPress: async () => {
                    try {
                      const r = await api<{ logged_out: number }>(`/users/${form.id}/logout-all`, { method: 'POST' });
                      Alert.alert('Done', `${form.name} was logged out of ${r.logged_out} phone(s).`);
                    } catch (e: any) {
                      Alert.alert('Error', e.message);
                    }
                  },
                },
              ])
            }
          />
        )}
        <Button variant="secondary" title="Cancel" onPress={() => setForm(null)} />
      </Screen>
    );
  }

  return (
    <Screen>
      <Button title="+ Add staff" onPress={() => setForm(blank)} />
      {users.map((u) => (
        <Pressable
          key={u.id}
          onPress={() =>
            setForm({ id: u.id, name: u.name, username: u.username, password: '', role: u.role, grade: u.grade ?? 'junior', phone: u.phone ?? '', active: !!u.active })
          }>
          <Card style={{ opacity: u.active ? 1 : 0.5 }}>
            <Text style={{ fontWeight: '700', fontSize: 16, color: C.text }}>{u.name}</Text>
            <Muted>
              {u.role}
              {u.grade ? ` · ${u.grade}` : ''} · @{u.username}
              {u.active ? '' : ' · inactive'}
              {u.active && u.must_change_password ? ' · temporary password' : ''}
            </Muted>
          </Card>
        </Pressable>
      ))}
    </Screen>
  );
}
