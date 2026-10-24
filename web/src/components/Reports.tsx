'use client';

// Incentive and Installed models reports. Phones: same cards as the app. PCs: tables with the
// per-job breakdown and Excel download.
import Link from 'next/link';
import { Fragment, useCallback, useEffect, useState } from 'react';
import { api, apiBlob, downloadFile } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { monthRange, niceDate, rm } from '@/lib/format';
import type { IncentiveReport, InstalledReport, JobType } from '@/lib/types';
import { Button, Card, Chips, cx, DateField, Empty, ErrorText, jobHref, Muted } from './ui';

type Period = 'this' | 'last' | 'custom';

export function usePeriod() {
  const [period, setPeriod] = useState<Period>('this');
  const [range, setRange] = useState(monthRange(0));
  const choose = (p: Period) => {
    setPeriod(p);
    if (p !== 'custom') setRange(monthRange(p === 'this' ? 0 : -1));
  };
  const picker = (
    <>
      <Chips
        options={[
          { value: 'this', label: 'This month' },
          { value: 'last', label: 'Last month' },
          { value: 'custom', label: 'Custom' },
        ]}
        value={period}
        onChange={choose}
      />
      {period === 'custom' && (
        <div className="flex gap-2 lg:max-w-md">
          <DateField label="From" value={range.from} onChange={(v) => v && setRange((r) => ({ ...r, from: v }))} />
          <DateField label="To" value={range.to} onChange={(v) => v && setRange((r) => ({ ...r, to: v }))} />
        </div>
      )}
      <Muted>
        Completed jobs {niceDate(range.from)} – {niceDate(range.to)}
      </Muted>
    </>
  );
  return { range, picker };
}

// Opens the printable incentive statement (admin only) in a new tab, ready to print for the staff meeting.
async function openStatement(range: { from: string; to: string }) {
  const tab = window.open('', '_blank');
  try {
    const url = URL.createObjectURL(await apiBlob(`/incentives/statement.pdf?from=${range.from}&to=${range.to}`, 120000));
    if (tab) tab.location.href = url;
    else window.location.href = url;
  } catch (e: any) {
    tab?.close();
    alert(e.message);
  }
}

export function IncentiveReportView({ range }: { range: { from: string; to: string } }) {
  const { user } = useAuth();
  const [report, setReport] = useState<IncentiveReport | null>(null);
  const [open, setOpen] = useState<number | null>(user?.role === 'technician' ? user.id : null);
  const [error, setError] = useState('');

  useEffect(() => {
    api<IncentiveReport>(`/incentives?from=${range.from}&to=${range.to}`)
      .then((r) => (setReport(r), setError('')))
      .catch((e) => setError(e.message));
  }, [range]);

  if (!report) return <ErrorText text={error} />;
  const isAdmin = user?.role === 'admin';

  return (
    <>
      <ErrorText text={error} />
      {isAdmin && (
        <div className="flex flex-wrap items-center gap-3">
          <Card className="min-w-[220px]">
            <Muted>Total incentive payable</Muted>
            <span className="text-[26px] font-extrabold">{rm(report.grand_total)}</span>
          </Card>
          <Button variant="secondary" title="🖨 Print statement for meeting" onPress={() => openStatement(range)} />
          <Button
            variant="secondary"
            title="⬇ Download Excel (summary + per job)"
            className="hidden lg:flex"
            onPress={() => downloadFile(`/export/incentives.xlsx?from=${range.from}&to=${range.to}`, `Incentive-${range.from}-to-${range.to}.xlsx`).catch((e) => alert(e.message))}
          />
        </div>
      )}
      {report.technicians.length === 0 && <Empty text="No completed jobs in this period" />}

      {/* Phone: cards, as in the app */}
      <div className="flex flex-col gap-3 lg:hidden">
        {report.technicians.map((t) => (
          <Card key={t.technician_id}>
            <button type="button" className="text-left" onClick={() => setOpen(open === t.technician_id ? null : t.technician_id)}>
              <div className="flex justify-between">
                <span className="text-[16px] font-bold">
                  {t.name} <span className="font-normal text-muted">({t.grade})</span>
                </span>
                <span className="text-[16px] font-extrabold text-success">{rm(t.total)}</span>
              </div>
              <Muted>
                {t.job_count} job(s) · base {rm(t.base_total)} · extras {rm(t.extras_total)} · adj {rm(t.adjustments_total)}
              </Muted>
            </button>
            {open === t.technician_id &&
              t.jobs.map((j) => (
                <Link key={j.job_id} href={jobHref(j.job_id)} className="mt-2 border-t border-line pt-2">
                  <div className="flex justify-between">
                    <span className="flex-1 font-semibold">
                      {j.job_no} · {j.customer_name}
                    </span>
                    <span className="font-bold">{rm(j.total)}</span>
                  </div>
                  <Muted>
                    {j.job_type} · done {niceDate(j.completed_at)} · base {rm(j.base)}
                  </Muted>
                  {j.extras.map((e) => (
                    <Muted key={`e${e.id}`}>
                      + {e.name} x{e.qty}: {rm(e.amount)}
                    </Muted>
                  ))}
                  {j.adjustments.map((a) => (
                    <Muted key={`a${a.id}`}>
                      {a.amount >= 0 ? '+' : ''} adj: {rm(a.amount)} — {a.reason}
                    </Muted>
                  ))}
                </Link>
              ))}
          </Card>
        ))}
      </div>

      {/* PC: table; click a technician for every job behind the total */}
      {report.technicians.length > 0 && (
        <div className="hidden overflow-hidden rounded-xl border-[0.5px] border-line bg-white lg:block">
          <table className="w-full text-[14px]">
            <thead className="bg-navy text-left text-white">
              <tr>
                {['Technician', 'Grade', 'Jobs', 'Base', 'Extras (welding etc.)', 'Adjustments', 'Total'].map((h, i) => (
                  <th key={h} className={cx('px-4 py-2 font-semibold', i >= 2 && 'text-right')}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {report.technicians.map((t) => (
                <Fragment key={t.technician_id}>
                  <tr className="cursor-pointer border-t border-line hover:bg-[#eef3ff]" onClick={() => setOpen(open === t.technician_id ? null : t.technician_id)}>
                    <td className="px-4 py-2.5 font-semibold">
                      {open === t.technician_id ? '▾' : '▸'} {t.name}
                    </td>
                    <td className="px-4 py-2.5 capitalize">{t.grade}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-right">{t.job_count}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-right">{rm(t.base_total)}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-right">{rm(t.extras_total)}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-right">{rm(t.adjustments_total)}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-right font-extrabold text-success">{rm(t.total)}</td>
                  </tr>
                  {open === t.technician_id &&
                    t.jobs.map((j) => (
                      <tr key={j.job_id} className="border-t border-line bg-bg text-[13px]">
                        <td className="px-4 py-2 pl-9" colSpan={3}>
                          <Link href={jobHref(j.job_id)} className="font-semibold text-primary">
                            {j.job_no}
                          </Link>{' '}
                          · {j.customer_name} · {j.job_type} · done {niceDate(j.completed_at)}
                          {j.adjustments.map((a) => (
                            <div key={a.id} className="text-muted">
                              Adjustment: {a.reason}
                            </div>
                          ))}
                          {j.extras.map((e) => (
                            <div key={e.id} className="text-muted">
                              {e.name} x{e.qty}
                            </div>
                          ))}
                        </td>
                        <td className="whitespace-nowrap px-4 py-2 text-right">{rm(j.base)}</td>
                        <td className="whitespace-nowrap px-4 py-2 text-right">{rm(j.extras.reduce((s, e) => s + e.amount, 0))}</td>
                        <td className="whitespace-nowrap px-4 py-2 text-right">{rm(j.adjustments.reduce((s, a) => s + a.amount, 0))}</td>
                        <td className="whitespace-nowrap px-4 py-2 text-right font-bold">{rm(j.total)}</td>
                      </tr>
                    ))}
                </Fragment>
              ))}
              {isAdmin && (
                <tr className="border-t-2 border-ink">
                  <td className="px-4 py-2.5 font-bold" colSpan={6}>
                    Company total
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-right text-[16px] font-extrabold">{rm(report.grand_total)}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

const titleCase = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();

export function InstalledModelsView({ range }: { range: { from: string; to: string } }) {
  const [jobTypes, setJobTypes] = useState<JobType[]>([]);
  const [jobTypeId, setJobTypeId] = useState<number | null>(null); // 0 = all
  const [report, setReport] = useState<InstalledReport | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api<JobType[]>('/job-types').then((all) => {
      const types = all.filter((t) => t.active);
      setJobTypes(types);
      setJobTypeId(types.find((t) => /install/i.test(t.name))?.id ?? 0);
    });
  }, []);

  const query = useCallback(() => `from=${range.from}&to=${range.to}${jobTypeId ? `&job_type_id=${jobTypeId}` : ''}`, [range, jobTypeId]);

  useEffect(() => {
    if (jobTypeId === null) return;
    api<InstalledReport>(`/reports/installed?${query()}`)
      .then((r) => (setReport(r), setError('')))
      .catch((e) => setError(e.message));
  }, [jobTypeId, query]);

  const typeName = jobTypes.find((t) => t.id === jobTypeId)?.name;
  const isInstall = !!typeName && /install/i.test(typeName);

  return (
    <>
      <Chips label="Job type" options={[...jobTypes.map((t) => ({ value: t.id, label: t.name })), { value: 0, label: 'All' }]} value={jobTypeId ?? 0} onChange={setJobTypeId} />
      <ErrorText text={error} />
      {report && (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <Card className="min-w-[220px]">
              <Muted>{isInstall ? 'Systems installed' : `${typeName ?? 'All'} jobs completed`}</Muted>
              <span className="text-[26px] font-extrabold">{report.total}</span>
            </Card>
            <Button
              variant="secondary"
              title="⬇ Download Excel"
              className="hidden lg:flex"
              onPress={() => downloadFile(`/export/installed.xlsx?${query()}`, `Installed-models-${range.from}-to-${range.to}.xlsx`).catch((e) => alert(e.message))}
            />
          </div>
          {report.by_model.length === 0 && <Empty text="Nothing completed in this period" />}
          <div className="flex flex-col gap-3 lg:grid lg:grid-cols-2 lg:items-start">
            {report.by_model.map((g) => {
              const key = `${g.model ?? ''}|${g.variant ?? ''}`;
              return (
                <Card key={key}>
                  <button type="button" className="text-left" onClick={() => setOpen(open === key ? null : key)}>
                    <div className="flex items-center justify-between">
                      <span className={cx('flex-1 text-[16px] font-bold', !g.model && 'text-muted')}>
                        {g.model ?? 'Model not recorded'}
                        {g.variant ? <span className="font-normal text-muted"> · {titleCase(g.variant)} door</span> : null}
                      </span>
                      <span className="text-[18px] font-extrabold text-primary">{g.count}</span>
                    </div>
                    <Muted>{open === key ? 'Tap to hide jobs' : 'Tap to see jobs'}</Muted>
                  </button>
                  {open === key &&
                    g.jobs.map((j) => (
                      <Link key={j.job_id} href={jobHref(j.job_id)} className="mt-2 border-t border-line pt-2">
                        <div className="font-semibold">
                          {j.job_no} · {j.customer_name}
                        </div>
                        <Muted>
                          Done {niceDate(j.completed_at)}
                          {j.inv_do_no ? ` · INV/DO ${j.inv_do_no}` : ''}
                          {jobTypeId === 0 ? ` · ${j.job_type}` : ''}
                        </Muted>
                        {j.address ? <Muted>{j.address}</Muted> : null}
                        <Muted>Tech: {j.technicians || '-'}</Muted>
                      </Link>
                    ))}
                </Card>
              );
            })}
          </div>
        </>
      )}
    </>
  );
}
