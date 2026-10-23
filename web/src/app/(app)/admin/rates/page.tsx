'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { rm } from '@/lib/format';
import type { ExtraItem, JobType } from '@/lib/types';
import { PageHeader } from '@/components/AppShell';
import { Button, Card, cx, Field, Muted, Screen, Title, Toggle } from '@/components/ui';

type Editing =
  | { kind: 'type'; id?: number; name: string; warranty_months: string; senior: string; junior: string; cap: string; active: boolean }
  | { kind: 'extra'; id?: number; name: string; unit: string; senior: string; junior: string; active: boolean };

export default function Rates() {
  const [types, setTypes] = useState<JobType[]>([]);
  const [extras, setExtras] = useState<ExtraItem[]>([]);
  const [edit, setEdit] = useState<Editing | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api<JobType[]>('/job-types').then(setTypes);
    api<ExtraItem[]>('/extra-items').then(setExtras);
  }, []);
  useEffect(load, [load]);

  const save = async () => {
    if (!edit) return;
    setBusy(true);
    try {
      if (edit.kind === 'type') {
        const body = {
          name: edit.name,
          warranty_months: Number(edit.warranty_months) || 0,
          senior_rate: Number(edit.senior) || 0,
          junior_rate: Number(edit.junior) || 0,
          incentive_cap: edit.cap === '' ? null : Number(edit.cap),
          active: edit.active,
        };
        await api(edit.id ? `/job-types/${edit.id}` : '/job-types', { method: edit.id ? 'PUT' : 'POST', body });
      } else {
        const body = { name: edit.name, unit: edit.unit || 'job', senior_amount: Number(edit.senior) || 0, junior_amount: Number(edit.junior) || 0, active: edit.active };
        await api(edit.id ? `/extra-items/${edit.id}` : '/extra-items', { method: edit.id ? 'PUT' : 'POST', body });
      }
      setEdit(null);
      load();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setBusy(false);
    }
  };

  if (edit) {
    const set = (p: Partial<Editing>) => setEdit({ ...edit, ...p } as Editing);
    return (
      <>
        <PageHeader title="Job types & incentive rates" back />
        <Screen>
          <Title>
            {edit.id ? 'Edit' : 'New'} {edit.kind === 'type' ? 'job type' : 'extra situation'}
          </Title>
          <Field label="Name" value={edit.name} onChange={(v) => set({ name: v })} />
          {edit.kind === 'type' ? (
            <Field label="Warranty (months)" value={edit.warranty_months} onChange={(v) => set({ warranty_months: v })} inputMode="numeric" />
          ) : (
            <Field label="Per (unit)" value={edit.unit} onChange={(v) => set({ unit: v })} placeholder="job / trip / hour / unit / metre" />
          )}
          <div className="flex gap-2">
            <div className="flex-1">
              <Field label="Senior tech (RM)" value={edit.senior} onChange={(v) => set({ senior: v })} inputMode="decimal" />
            </div>
            <div className="flex-1">
              <Field label="Junior tech (RM)" value={edit.junior} onChange={(v) => set({ junior: v })} inputMode="decimal" />
            </div>
          </div>
          {edit.kind === 'type' && (
            <>
              <Field label="Job limit (RM, optional)" value={edit.cap} onChange={(v) => set({ cap: v })} inputMode="decimal" placeholder="Blank = no limit" />
              <Muted>
                If the technicians&apos; rates add up to more than this limit (e.g. heavy glass needing 3-5 people), the limit is shared equally instead. Welding and other extras are not part of the limit.
              </Muted>
            </>
          )}
          <Muted>Rate changes apply to how incentive is calculated for all jobs, including past ones shown in reports.</Muted>
          <div className="flex items-center justify-between">
            <span className="text-[16px]">Active</span>
            <Toggle value={edit.active} onChange={(v) => set({ active: v })} />
          </div>
          <Button title="Save" onPress={save} loading={busy} />
          <Button variant="secondary" title="Cancel" onPress={() => setEdit(null)} />
        </Screen>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Job types & incentive rates" back />
      <Screen wide>
        <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
          <div className="flex flex-col gap-3">
            <Title>Job types (base incentive per technician)</Title>
            {types.map((t) => (
              <button
                type="button"
                key={t.id}
                className="text-left"
                onClick={() =>
                  setEdit({
                    kind: 'type',
                    id: t.id,
                    name: t.name,
                    warranty_months: String(t.warranty_months),
                    senior: String(t.senior_rate),
                    junior: String(t.junior_rate),
                    cap: t.incentive_cap == null ? '' : String(t.incentive_cap),
                    active: !!t.active,
                  })
                }>
                <Card className={cx(!t.active && 'opacity-50')}>
                  <span className="font-bold text-ink">{t.name}</span>
                  <Muted>
                    Senior {rm(t.senior_rate)} · Junior {rm(t.junior_rate)} · Warranty {t.warranty_months} mth
                    {t.incentive_cap != null ? ` · Job limit ${rm(t.incentive_cap)}` : ''}
                  </Muted>
                </Card>
              </button>
            ))}
            <Button variant="secondary" title="+ Add job type" onPress={() => setEdit({ kind: 'type', name: '', warranty_months: '0', senior: '', junior: '', cap: '', active: true })} />
          </div>
          <div className="flex flex-col gap-3">
            <Title>Extra situations (added on top)</Title>
            <Muted>Technicians tick these on the job (e.g. welding). Amount x quantity is added per technician.</Muted>
            {extras.map((e) => (
              <button
                type="button"
                key={e.id}
                className="text-left"
                onClick={() => setEdit({ kind: 'extra', id: e.id, name: e.name, unit: e.unit, senior: String(e.senior_amount), junior: String(e.junior_amount), active: !!e.active })}>
                <Card className={cx(!e.active && 'opacity-50')}>
                  <span className="font-bold text-ink">{e.name}</span>
                  <Muted>
                    Senior {rm(e.senior_amount)} · Junior {rm(e.junior_amount)} per {e.unit}
                  </Muted>
                </Card>
              </button>
            ))}
            <Button variant="secondary" title="+ Add extra situation" onPress={() => setEdit({ kind: 'extra', name: '', unit: 'job', senior: '', junior: '', active: true })} />
          </div>
        </div>
      </Screen>
    </>
  );
}
