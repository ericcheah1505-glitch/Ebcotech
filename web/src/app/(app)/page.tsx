'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { monthRange, niceDate, rm, todayStr } from '@/lib/format';
import type { IncentiveReport, JobSummary, Reminders } from '@/lib/types';
import { PageHeader } from '@/components/AppShell';
import { Card, Empty, ErrorText, JobCard, LinkButton, Muted, Screen, Title } from '@/components/ui';

// Today (phone, same as the app) / Dashboard (PC: summary tiles + sections side by side).
export default function Today() {
  const { user, refreshSettings } = useAuth();
  const [data, setData] = useState<Reminders | null>(null);
  const [payable, setPayable] = useState<number | null>(null);
  const [error, setError] = useState('');

  const isAdmin = user?.role === 'admin';
  const load = useCallback(async () => {
    try {
      refreshSettings();
      setData(await api<Reminders>('/reminders'));
      if (isAdmin) {
        const r = monthRange(0);
        setPayable((await api<IncentiveReport>(`/incentives?from=${r.from}&to=${r.to}`)).grand_total);
      }
      setError('');
    } catch (e: any) {
      setError(e.message);
    }
  }, [refreshSettings, isAdmin]);

  useEffect(() => {
    load();
  }, [load]);

  const staff = user?.role !== 'technician';
  const waitingSign = (data?.awaiting_done?.length ?? 0) + (data?.awaiting_signature?.length ?? 0);
  const warranty = data?.warranty_followup;

  return (
    <>
      <PageHeader title="Today" pcTitle={user?.role === 'admin' ? 'Dashboard' : 'Today'} />
      <Screen wide>
        <div className="text-[22px] font-extrabold text-ink">Hi, {user?.name}</div>
        <Muted>
          {niceDate(todayStr())}
          <span className="lg:hidden"> · pull down to refresh</span>
        </Muted>
        <ErrorText text={error} />
        {staff && <LinkButton href="/job/edit/" title="+ Post new job" className="lg:max-w-xs" />}

        {data && (
          <>
            {/* PC only: numbers at a glance */}
            <div className="hidden gap-3 lg:grid lg:grid-cols-4 2xl:grid-cols-7">
              <Tile label="Jobs today" value={data.today.length} />
              <Tile label="Overdue" value={data.overdue.length} alert={data.overdue.length > 0} />
              <Tile label="KIV" value={data.kiv.length} />
              {staff && <Tile label="Waiting signature / done" value={waitingSign} alert={waitingSign > 0} />}
              {staff && <Tile label="Unassigned" value={data.unassigned?.length ?? 0} alert={(data.unassigned?.length ?? 0) > 0} />}
              {warranty && (
                <Link href="/warranty/">
                  <Tile label="Warranty follow-up (30 days)" value={warranty.count} alert={warranty.count > 0 || warranty.callbacks.length > 0} />
                </Link>
              )}
              {payable !== null && (
                <Link href="/incentive/">
                  <Tile label="Incentive payable (this month)" value={rm(payable)} />
                </Link>
              )}
            </div>

            <div className="grid gap-3 lg:grid-cols-2 lg:items-start lg:gap-6">
              {data.overdue.length > 0 && <Section title={`⚠️ Overdue (${data.overdue.length})`} jobs={data.overdue} />}
              <Section title={`Today (${data.today.length})`} jobs={data.today} empty="No jobs today" showDate={false} />
              <Section title={`Tomorrow (${data.tomorrow.length})`} jobs={data.tomorrow} empty="No jobs tomorrow" showDate={false} />
              <Section title={`KIV – waiting confirmation (${data.kiv.length})`} jobs={data.kiv} empty="No KIV jobs" />
              {data.awaiting_done && data.awaiting_done.length > 0 && (
                <Section
                  title={`✍ ${isAdmin ? 'Waiting for the salesman to sign & mark done' : 'Waiting for you to mark done'} (${data.awaiting_done.length})`}
                  jobs={data.awaiting_done}
                />
              )}
              {data.unassigned && <Section title={`Unassigned (${data.unassigned.length})`} jobs={data.unassigned} empty="All jobs assigned" />}
              {data.awaiting_signature && data.awaiting_signature.length > 0 && (
                <Section title={`Awaiting salesman signature (${data.awaiting_signature.length})`} jobs={data.awaiting_signature} />
              )}
              {data.upcoming_contracts && (
                <div className="flex flex-col gap-3">
                  <Title>Contract servicing due in 30 days ({data.upcoming_contracts.length})</Title>
                  {data.upcoming_contracts.length === 0 && <Empty text="None due" />}
                  {data.upcoming_contracts.map((c) => (
                    <Link key={c.id} href={`/contracts/edit/?id=${c.id}`}>
                      <Card>
                        <span className="font-bold">{c.customer_name}</span>
                        <Muted>
                          Due {niceDate(c.next_service_date)} · every {c.interval_months} month(s) · {c.job_type}
                        </Muted>
                      </Card>
                    </Link>
                  ))}
                </div>
              )}
              {warranty && (
                <div className="flex flex-col gap-3">
                  <Title>🛡 Warranty follow-up</Title>
                  {warranty.callbacks.map((c) => (
                    <Link key={c.job_id} href="/warranty/">
                      <Card className="border border-kiv">
                        <span className="font-bold">📞 Call back: {c.customer_name}</span>
                        <Muted>
                          Due {niceDate(c.callback_date)}
                          {c.note ? ` · ${c.note}` : ''}
                        </Muted>
                      </Card>
                    </Link>
                  ))}
                  <Link href="/warranty/">
                    <Card className={warranty.count > 0 ? 'border border-warn' : ''}>
                      <span className="font-bold">
                        {warranty.count === 0 ? 'No warranties ending in the next 30 days' : `${warranty.count} customer${warranty.count === 1 ? '' : 's'} – warranty ending in 30 days`}
                      </span>
                      <Muted>Offer servicing or a service contract ›</Muted>
                    </Card>
                  </Link>
                </div>
              )}
            </div>
          </>
        )}
      </Screen>
    </>
  );
}

function Tile({ label, value, alert }: { label: string; value: number | string; alert?: boolean }) {
  return (
    <Card className={alert ? 'border border-warn' : ''}>
      <Muted>{label}</Muted>
      <span className={`text-[26px] font-extrabold ${alert ? 'text-warn' : 'text-ink'}`}>{value}</span>
    </Card>
  );
}

function Section({ title, jobs, empty, showDate = true }: { title: string; jobs: JobSummary[]; empty?: string; showDate?: boolean }) {
  return (
    <div className="flex flex-col gap-3">
      <Title>{title}</Title>
      {jobs.length === 0 && empty ? <Empty text={empty} /> : null}
      {jobs.map((j) => (
        <JobCard key={j.id} job={j} showDate={showDate} />
      ))}
    </div>
  );
}
