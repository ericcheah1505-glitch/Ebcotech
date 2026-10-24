'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { toDateStr, todayStr } from '@/lib/format';
import type { Contract, JobDetail, JobType } from '@/lib/types';
import { PageHeader } from '@/components/AppShell';
import { Button, Card, Chips, DateField, Field, Loading, Muted, Screen, Toggle } from '@/components/ui';

function EditContract() {
  const params = useSearchParams();
  const id = params.get('id');
  // "Create service contract" on the warranty follow-up page: customer details copied from that job.
  const fromWarranty = id ? null : params.get('from_warranty');
  const [fromJob, setFromJob] = useState<JobDetail | null>(null);
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
        if (fromWarranty) {
          const j = await api<JobDetail>(`/jobs/${fromWarranty}`);
          setFromJob(j);
          // The contract starts the day after the warranty ends (or today if it has already ended).
          const next = j.warranty_end ? new Date(`${j.warranty_end}T00:00:00`) : new Date();
          next.setDate(next.getDate() + 1);
          const start = j.warranty_end && j.warranty_end >= todayStr() ? toDateStr(next) : todayStr();
          setF((x) => ({
            ...x,
            customer_name: j.customer_name,
            customer_phone: j.customer_phone ?? '',
            address: j.address ?? '',
            start_date: start,
            notes: `After warranty of ${j.job_no} (${[j.job_type, j.product_model, j.product_variant].filter(Boolean).join(' · ')})`,
          }));
        }
      }
      setReady(true);
    })().catch((e) => alert(e.message));
  }, [id, fromWarranty]);

  if (!ready) return <Loading />;

  const save = async () => {
    setBusy(true);
    try {
      const body = { ...f, interval_months: Number(f.interval_months) || 3, ...(fromJob ? { warranty_followup_job_id: fromJob.id } : {}) };
      await api(id ? `/contracts/${id}` : '/contracts', { method: id ? 'PUT' : 'POST', body });
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
        {fromJob && (
          <Card className="border border-success">
            <span className="font-bold text-success">🛡 From the warranty follow-up of {fromJob.job_no}</span>
            <Muted>Customer details are copied from that job. Saving this contract marks the customer as booked.</Muted>
          </Card>
        )}
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
