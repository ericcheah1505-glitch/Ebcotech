'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { todayStr } from '@/lib/format';
import type { Contract, JobType } from '@/lib/types';
import { PageHeader } from '@/components/AppShell';
import { Button, Chips, DateField, Field, Loading, Muted, Screen, Toggle } from '@/components/ui';

function EditContract() {
  const id = useSearchParams().get('id');
  const router = useRouter();
  const [types, setTypes] = useState<JobType[]>([]);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({
    customer_name: '',
    customer_phone: '',
    address: '',
    job_type_id: null as number | null,
    interval_months: '3',
    start_date: todayStr() as string | null,
    end_date: null as string | null,
    next_service_date: null as string | null,
    notes: '',
    active: true,
  });
  const set = (patch: Partial<typeof f>) => setF((x) => ({ ...x, ...patch }));

  useEffect(() => {
    (async () => {
      const t = await api<JobType[]>('/job-types');
      setTypes(t.filter((x) => x.active));
      if (id) {
        const c = (await api<Contract[]>('/contracts')).find((x) => String(x.id) === String(id));
        if (c) {
          setF({
            customer_name: c.customer_name,
            customer_phone: c.customer_phone ?? '',
            address: c.address ?? '',
            job_type_id: c.job_type_id,
            interval_months: String(c.interval_months),
            start_date: c.start_date,
            end_date: c.end_date,
            next_service_date: c.next_service_date,
            notes: c.notes ?? '',
            active: !!c.active,
          });
        }
      } else {
        const servicing = t.find((x) => /servic/i.test(x.name));
        if (servicing) setF((x) => ({ ...x, job_type_id: servicing.id }));
      }
      setReady(true);
    })().catch((e) => alert(e.message));
  }, [id]);

  if (!ready) return <Loading />;

  const save = async () => {
    setBusy(true);
    try {
      await api(id ? `/contracts/${id}` : '/contracts', { method: id ? 'PUT' : 'POST', body: { ...f, interval_months: Number(f.interval_months) || 3 } });
      router.back();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader title={id ? 'Edit contract' : 'New service contract'} back />
      <Screen>
        <Field label="Customer *" value={f.customer_name} onChange={(v) => set({ customer_name: v })} />
        <Field label="Phone" type="tel" value={f.customer_phone} onChange={(v) => set({ customer_phone: v })} />
        <Field label="Address" value={f.address} onChange={(v) => set({ address: v })} multiline />
        <Chips label="Job type *" options={types.map((t) => ({ value: t.id, label: t.name }))} value={f.job_type_id} onChange={(v) => set({ job_type_id: v })} />
        <Field label="Service every (months)" value={f.interval_months} onChange={(v) => set({ interval_months: v })} inputMode="numeric" />
        <div className="flex gap-2">
          <DateField label="Contract start *" value={f.start_date} onChange={(v) => set({ start_date: v })} />
          <DateField label="Contract end" value={f.end_date} onChange={(v) => set({ end_date: v })} clearable />
        </div>
        <DateField label={id ? 'Next service date' : 'First service date (blank = start date)'} value={f.next_service_date} onChange={(v) => set({ next_service_date: v })} clearable={!id} />
        <Muted>After each servicing job is completed, the next service date moves forward automatically.</Muted>
        <Field label="Notes" value={f.notes} onChange={(v) => set({ notes: v })} multiline placeholder="e.g. 4 units sliding door, lobby + loading bay" />
        {id && (
          <div className="flex items-center justify-between">
            <span className="text-[16px]">Active</span>
            <Toggle value={f.active} onChange={(v) => set({ active: v })} />
          </div>
        )}
        <Button title="Save" onPress={save} loading={busy} className="lg:max-w-xs" />
      </Screen>
    </>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<Loading />}>
      <EditContract />
    </Suspense>
  );
}
