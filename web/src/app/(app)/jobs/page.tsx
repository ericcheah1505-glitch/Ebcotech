'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, downloadFile } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { niceDate, todayStr } from '@/lib/format';
import type { JobSummary, JobType, User } from '@/lib/types';
import { PageHeader } from '@/components/AppShell';
import { JobView } from '@/components/JobView';
import { Button, Chips, cx, Empty, ErrorText, Field, JobCard, LinkButton, Muted, Screen, StatusBadge } from '@/components/ui';

const FILTERS = [
  { value: 'open', label: 'Open', status: 'pending,assigned,in_progress' },
  { value: 'kiv', label: 'KIV', status: 'kiv' },
  { value: 'completed', label: 'Completed', status: 'completed' },
  { value: 'cancelled', label: 'Cancelled', status: 'cancelled' },
  { value: 'all', label: 'All', status: '' },
];

type SortKey = 'job_no' | 'scheduled_date' | 'customer_name' | 'inv_do_no' | 'model' | 'job_type' | 'technicians' | 'salesman_name' | 'status';

export default function Jobs() {
  const { user } = useAuth();
  const staff = user?.role !== 'technician';
  const [filter, setFilter] = useState('open');
  const [q, setQ] = useState('');
  // PC table filters
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [techId, setTechId] = useState('');
  const [salesId, setSalesId] = useState('');
  const [typeId, setTypeId] = useState('');
  const [people, setPeople] = useState<User[]>([]);
  const [types, setTypes] = useState<JobType[]>([]);
  const [jobs, setJobs] = useState<JobSummary[]>([]);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<number | null>(null);
  const [sort, setSort] = useState<{ key: SortKey; asc: boolean }>({ key: 'scheduled_date', asc: false });

  const params = useCallback(() => {
    const p = new URLSearchParams();
    const status = FILTERS.find((f) => f.value === filter)!.status;
    // A search looks through every job (completed ones too), not just the selected tab.
    if (status && !q.trim()) p.set('status', status);
    if (q.trim()) p.set('q', q.trim());
    if (from) p.set('from', from);
    if (to) p.set('to', to);
    if (techId) p.set('technician_id', techId);
    if (salesId) p.set('salesman_id', salesId);
    if (typeId) p.set('job_type_id', typeId);
    return p;
  }, [filter, q, from, to, techId, salesId, typeId]);

  const load = useCallback(async () => {
    try {
      setJobs(await api<JobSummary[]>(`/jobs?${params()}`));
      setError('');
    } catch (e: any) {
      setError(e.message);
    }
  }, [params]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  useEffect(() => {
    if (!staff) return;
    api<User[]>('/users').then(setPeople).catch(() => {});
    api<JobType[]>('/job-types').then(setTypes).catch(() => {});
  }, [staff]);

  const sorted = useMemo(() => {
    const val = (j: JobSummary) =>
      sort.key === 'model' ? [j.product_model, j.product_variant].filter(Boolean).join(' ') : sort.key === 'status' ? (j.submitted_at && j.status === 'in_progress' ? 'waiting' : j.status) : (j[sort.key] ?? '');
    return [...jobs].sort((a, b) => String(val(a)).localeCompare(String(val(b))) * (sort.asc ? 1 : -1));
  }, [jobs, sort]);

  const th = (key: SortKey, label: string) => (
    <th className="cursor-pointer select-none whitespace-nowrap px-3 py-2 text-left font-semibold" onClick={() => setSort((s) => ({ key, asc: s.key === key ? !s.asc : true }))}>
      {label} {sort.key === key ? (sort.asc ? '▲' : '▼') : ''}
    </th>
  );

  const searchBox = <Field label="Search" value={q} onChange={setQ} placeholder="INV / DO no., customer, job no., address" autoCapitalize="characters" />;
  const statusChips = q.trim() ? <Muted>Searching all jobs</Muted> : <Chips options={FILTERS.map(({ value, label }) => ({ value, label }))} value={filter} onChange={setFilter} />;

  return (
    <>
      <PageHeader title="Jobs" right={staff ? <LinkButton href="/job/edit/" title="+ Post new job" small className="hidden lg:flex" /> : null} />

      {/* Phone: same as the app */}
      <div className="lg:hidden">
        <Screen>
          {staff && <LinkButton href="/job/edit/" title="+ Post new job" />}
          {searchBox}
          {statusChips}
          <ErrorText text={error} />
          {jobs.length === 0 && <Empty text="No jobs" />}
          {jobs.map((j) => (
            <JobCard key={j.id} job={j} />
          ))}
        </Screen>
      </div>

      {/* PC: filters + table, with the selected job beside it */}
      <div className="hidden min-h-0 flex-1 gap-4 p-6 pt-4 lg:flex">
        <div className={cx('flex min-w-0 flex-col gap-3', selected ? 'w-[55%]' : 'w-full')}>
          <div className="flex flex-wrap items-end gap-3 rounded-xl border-[0.5px] border-line bg-white p-3">
            <div className="min-w-[260px] flex-1">{searchBox}</div>
            <DateBox label="Date from" value={from} onChange={setFrom} />
            <DateBox label="Date to" value={to} onChange={setTo} />
            {staff && (
              <>
                <Select label="Technician" value={techId} onChange={setTechId} options={people.filter((u) => u.role === 'technician').map((u) => [String(u.id), u.name])} />
                <Select label="Salesman" value={salesId} onChange={setSalesId} options={people.filter((u) => u.role !== 'technician').map((u) => [String(u.id), u.name])} />
                <Select label="Job type" value={typeId} onChange={setTypeId} options={types.map((t) => [String(t.id), t.name])} />
              </>
            )}
            {staff && (
              <Button
                variant="secondary"
                small
                title="⬇ Excel"
                onPress={() => downloadFile(`/export/jobs.xlsx?${params()}`, `Jobs-${todayStr()}.xlsx`).catch((e) => alert(e.message))}
              />
            )}
          </div>
          <div className="flex items-center gap-3">
            {statusChips}
            <Muted className="ml-auto">{jobs.length} job(s)</Muted>
          </div>
          <ErrorText text={error} />
          <div className="min-h-0 overflow-auto rounded-xl border-[0.5px] border-line bg-white">
            <table className="w-full text-[13px]">
              <thead className="sticky top-0 bg-navy text-white">
                <tr>
                  {th('job_no', 'Job no.')}
                  {th('scheduled_date', 'Date')}
                  {th('customer_name', 'Customer')}
                  {th('inv_do_no', 'INV/DO')}
                  {th('model', 'Model')}
                  {th('job_type', 'Type')}
                  {th('technicians', 'Technician')}
                  {th('salesman_name', 'Salesman')}
                  {th('status', 'Status')}
                </tr>
              </thead>
              <tbody>
                {sorted.map((j) => (
                  <tr
                    key={j.id}
                    onClick={() => setSelected(j.id)}
                    className={cx('cursor-pointer border-t border-line hover:bg-[#eef3ff]', selected === j.id && 'bg-[#dbe6ff]')}>
                    <td className="whitespace-nowrap px-3 py-2 font-semibold">{j.job_no}</td>
                    <td className="whitespace-nowrap px-3 py-2">
                      {niceDate(j.scheduled_date)} {j.scheduled_time ?? ''}
                    </td>
                    <td className="px-3 py-2">{j.customer_name}</td>
                    <td className="whitespace-nowrap px-3 py-2">{j.inv_do_no ?? ''}</td>
                    <td className="px-3 py-2">{[j.product_model, j.product_variant].filter(Boolean).join(' ')}</td>
                    <td className="px-3 py-2">{j.job_type}</td>
                    <td className="px-3 py-2">{j.technicians ?? <span className="text-muted">Not assigned</span>}</td>
                    <td className="px-3 py-2">{j.salesman_name ?? ''}</td>
                    <td className="px-3 py-2">
                      <StatusBadge status={j.status} submitted={!!j.submitted_at} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {jobs.length === 0 && <Empty text="No jobs" />}
          </div>
        </div>

        {selected && (
          <div className="flex w-[45%] min-w-0 flex-col overflow-hidden rounded-xl border-[0.5px] border-line bg-bg">
            <div className="flex items-center gap-2 border-b border-line bg-white px-4 py-3">
              <span className="flex-1 font-bold">Job details</span>
              {staff && <LinkButton href={`/job/edit/?id=${selected}`} title="Edit" variant="secondary" small />}
              <LinkButton href={`/job/?id=${selected}`} title="Open full page" variant="secondary" small />
              <Button title="✕" variant="secondary" small onPress={() => setSelected(null)} />
            </div>
            <div className="overflow-y-auto p-4">
              <JobView key={selected} id={selected} onChanged={load} />
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function DateBox({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[13px] font-semibold text-muted">{label}</span>
      <input type="date" className="field w-40" value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[13px] font-semibold text-muted">{label}</span>
      <select className="field w-44" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">All</option>
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );
}
