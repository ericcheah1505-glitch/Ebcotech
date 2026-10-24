'use client';

// Warranty follow-up: customers whose warranty ends soon (or just ended), to offer servicing or a service
// contract. Tapping WhatsApp / Call records "contacted" by itself; quoted, call back and declined take one
// tap; creating a servicing job or contract from here marks the customer as booked.
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { niceDate, niceDateTime, todayStr } from '@/lib/format';
import type { FollowupStatus, User, WarrantyFollowup, WarrantyFollowupList } from '@/lib/types';
import { FOLLOWUP_COLOR, FOLLOWUP_LABEL, followupMessage, monthsLabel, telNumber, whatsappNumber } from '@/lib/warranty';
import { PageHeader } from '@/components/AppShell';
import { Button, Card, Chips, cx, DateField, Empty, ErrorText, Field, jobHref, LinkButton, Muted, Screen, Title } from '@/components/ui';

const RANGES = [
  { value: '30', label: 'Next 30 days' },
  { value: '60', label: '60 days' },
  { value: '90', label: '90 days' },
  { value: 'ended', label: 'Ended (last 30 days)' },
];
const SHOWS = [
  { value: 'open', label: 'To follow up' },
  { value: 'booked', label: 'Booked' },
  { value: 'declined', label: 'Declined' },
  { value: 'all', label: 'All' },
];
// Statuses set by hand ("Not contacted" undoes a mistake).
const SET_STATUSES: { value: FollowupStatus; label: string }[] = [
  { value: 'quoted', label: 'Quoted' },
  { value: 'callback', label: 'Call back later' },
  { value: 'declined', label: 'Declined' },
  { value: 'booked', label: 'Booked' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'new', label: 'Not contacted' },
];

export default function WarrantyFollowupPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [range, setRange] = useState('30');
  const [show, setShow] = useState('open');
  const [salesmanId, setSalesmanId] = useState(0);
  const [salesmen, setSalesmen] = useState<User[]>([]);
  const [data, setData] = useState<WarrantyFollowupList | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const params = new URLSearchParams({ range, show });
    if (salesmanId) params.set('salesman_id', String(salesmanId));
    try {
      setData(await api<WarrantyFollowupList>(`/warranty-followups?${params}`));
      setError('');
    } catch (e: any) {
      setError(e.message);
    }
  }, [range, show, salesmanId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!isAdmin) return;
    api<User[]>('/users')
      .then((u) => setSalesmen(u.filter((x) => x.role === 'salesman' && x.active)))
      .catch(() => {});
  }, [isAdmin]);

  // Call-backs that are due show at the top only, not twice.
  const dueIds = new Set(data?.callbacks_due.map((c) => c.job_id));
  const items = data?.items.filter((i) => !dueIds.has(i.job_id)) ?? [];

  return (
    <>
      <PageHeader title="Warranty follow-up" back />
      <Screen wide>
        <Muted>
          Customers whose warranty ends soon – offer servicing or a service contract. WhatsApp and Call mark the customer as contacted by
          themselves; record a quotation, call-back or decline with one tap.
        </Muted>
        <Chips options={RANGES} value={range} onChange={setRange} />
        <Chips options={SHOWS} value={show} onChange={setShow} />
        {isAdmin && salesmen.length > 0 && (
          <Chips options={[{ value: 0, label: 'All salesmen' }, ...salesmen.map((s) => ({ value: s.id, label: s.name }))]} value={salesmanId} onChange={setSalesmanId} />
        )}
        <ErrorText text={error} />

        {data && data.callbacks_due.length > 0 && (
          <>
            <Title>📞 Call back today ({data.callbacks_due.length})</Title>
            <div className="grid gap-3 lg:grid-cols-2 lg:items-start">
              {data.callbacks_due.map((f) => (
                <FollowupCard key={f.job_id} item={f} showSalesman={isAdmin} onChanged={load} />
              ))}
            </div>
          </>
        )}

        {data && (
          <>
            <Title>
              {range === 'ended' ? 'Warranty ended' : 'Warranty ending'} {niceDate(data.from)} – {niceDate(data.to)} ({items.length})
            </Title>
            {items.length === 0 && <Empty text={show === 'open' ? 'Nobody to follow up in this period' : 'None'} />}
            <div className="grid gap-3 lg:grid-cols-2 lg:items-start">
              {items.map((f) => (
                <FollowupCard key={f.job_id} item={f} showSalesman={isAdmin} onChanged={load} />
              ))}
            </div>
            {show === 'open' && <Muted>Customers with an active service contract are left out. Choose “All” to see them.</Muted>}
          </>
        )}
      </Screen>
    </>
  );
}

function FollowupCard({ item, showSalesman, onChanged }: { item: WarrantyFollowup; showSalesman: boolean; onChanged: () => void }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<FollowupStatus>('quoted');
  const [note, setNote] = useState('');
  const [date, setDate] = useState<string | null>(todayStr());
  const [busy, setBusy] = useState(false);

  const shown = item.expired ? 'expired' : item.status;
  const wa = whatsappNumber(item.customer_phone);
  const tel = telNumber(item.customer_phone);
  const door = [item.product_model, item.product_variant].filter(Boolean).join(' ');
  const days = item.days_left;
  const when = days > 0 ? `in ${days} day${days === 1 ? '' : 's'}` : days === 0 ? 'today' : `${-days} day${days === -1 ? '' : 's'} ago`;

  // WhatsApp / Call open straight away (phones allow it only right after a tap); the contact is recorded meanwhile.
  const recordContact = (via: 'whatsapp' | 'call') => {
    api(`/warranty-followups/${item.job_id}/contacted`, { body: { via } })
      .then(onChanged)
      .catch(() => {});
  };

  const save = async (body: object) => {
    setBusy(true);
    try {
      await api(`/warranty-followups/${item.job_id}`, { body });
      setOpen(false);
      setNote('');
      onChanged();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setBusy(false);
    }
  };

  const noteLabel =
    status === 'quoted'
      ? 'Quotation no. / amount (optional)'
      : status === 'declined'
        ? 'Reason * (e.g. price, using another company)'
        : 'Note (optional)';

  return (
    <Card className={cx(item.callback_due && 'border border-kiv', item.expired && 'border border-danger')}>
      <div className="flex items-start justify-between gap-2">
        <span className="flex-1 text-[16px] font-bold">{item.customer_name}</span>
        <span className="shrink-0 rounded-full px-2.5 py-0.5 text-[12px] font-bold text-white" style={{ background: FOLLOWUP_COLOR[shown] }}>
          {FOLLOWUP_LABEL[shown]}
        </span>
      </div>
      <span className={cx('text-[14px] font-semibold', days < 0 ? 'text-danger' : days <= 14 ? 'text-warn' : 'text-ink')}>
        Warranty {days < 0 ? 'ended' : 'ends'} {niceDate(item.warranty_end)} · {when}
      </span>
      <Muted>
        <Link href={jobHref(item.job_id)} className="font-semibold text-primary">
          {item.job_no}
        </Link>{' '}
        · {item.job_type} · {monthsLabel(item.warranty_months ?? 0)}
        {door ? ` · ${door}` : ''}
        {item.inv_do_no ? ` · ${item.inv_do_no}` : ''}
      </Muted>
      {(item.customer_phone || item.address) && <Muted>{[item.customer_phone, item.address].filter(Boolean).join(' · ')}</Muted>}
      {showSalesman && <Muted>Salesman: {item.salesman_name ?? '–'}</Muted>}
      {item.has_contract && <Muted className="font-semibold text-success">📄 Has an active service contract</Muted>}

      {/* What has been done so far */}
      {item.status === 'contacted' && item.contacted_at && (
        <Muted>
          Contacted {niceDateTime(item.contacted_at)} by {item.contacted_by_name}
          {item.note ? ` – ${item.note}` : ''}
        </Muted>
      )}
      {item.status === 'quoted' && <Muted>Quoted{item.note ? `: ${item.note}` : ''}</Muted>}
      {item.status === 'callback' && (
        <Muted className={item.callback_due ? 'font-semibold text-kiv' : ''}>
          Call back on {niceDate(item.callback_date)}
          {item.note ? ` – ${item.note}` : ''}
        </Muted>
      )}
      {item.status === 'declined' && <Muted>Declined: {item.note}</Muted>}
      {item.status === 'booked' && (
        <Muted className="font-semibold text-success">
          {item.booked_job_id ? (
            <Link href={jobHref(item.booked_job_id)}>Booked – job {item.booked_job_no} ›</Link>
          ) : item.booked_contract_id ? (
            <Link href={`/contracts/edit/?id=${item.booked_contract_id}`}>Booked – service contract ›</Link>
          ) : (
            `Booked${item.note ? ` – ${item.note}` : ''}`
          )}
        </Muted>
      )}
      {item.status !== 'contacted' && item.contacted_at && <Muted>Last contact {niceDateTime(item.contacted_at)} by {item.contacted_by_name}</Muted>}
      {item.updated_by_name && item.status !== 'new' && <Muted>Updated by {item.updated_by_name}</Muted>}

      {item.possible_match && (
        <div className="mt-1 flex flex-col gap-2 rounded-lg bg-bg p-2.5">
          <span className="text-[13px]">
            New job{' '}
            <Link href={jobHref(item.possible_match.id)} className="font-semibold text-primary">
              {item.possible_match.job_no}
            </Link>{' '}
            ({item.possible_match.job_type}, {niceDate(item.possible_match.created_at)}) was posted for this customer.
          </span>
          <Button small variant="success" title="Mark as booked with this job" loading={busy} onPress={() => save({ status: 'booked', booked_job_id: item.possible_match!.id })} />
        </div>
      )}

      <div className="mt-1 flex flex-wrap gap-2">
        {wa ? (
          <a
            href={`https://wa.me/${wa}?text=${encodeURIComponent(followupMessage(item, user?.name ?? 'Ebcotech'))}`}
            target="_blank"
            rel="noreferrer"
            onClick={() => recordContact('whatsapp')}
            className="flex items-center justify-center rounded-[10px] bg-[#25D366] px-3 py-2 text-[15px] font-bold text-white active:opacity-80">
            💬 WhatsApp
          </a>
        ) : null}
        {tel ? (
          <a href={`tel:${tel}`} onClick={() => recordContact('call')} className="flex items-center justify-center rounded-[10px] bg-line px-3 py-2 text-[15px] font-bold text-ink active:opacity-80">
            📞 Call
          </a>
        ) : null}
        <Button small variant="secondary" title={open ? 'Close' : '✎ Update'} onPress={() => setOpen(!open)} />
      </div>
      {!wa && !tel && <Muted>No phone number on the job – add it on the job to use WhatsApp / Call.</Muted>}

      {open && (
        <div className="mt-2 flex flex-col gap-2.5 border-t border-line pt-3">
          <div className="flex flex-col gap-2 lg:flex-row">
            <LinkButton small href={`/job/edit/?from_warranty=${item.job_id}`} title="+ Create servicing job" className="flex-1" />
            <LinkButton small variant="secondary" href={`/contracts/edit/?from_warranty=${item.job_id}`} title="+ Create service contract" className="flex-1" />
          </div>
          <Muted>Either one marks the customer as booked by itself.</Muted>
          <Chips label="Or record what happened" options={SET_STATUSES} value={status} onChange={setStatus} />
          {status === 'callback' && <DateField label="Call back on *" value={date} onChange={setDate} />}
          {status !== 'new' && <Field label={noteLabel} value={note} onChange={setNote} />}
          <Button
            title="Save"
            loading={busy}
            onPress={() => save({ status, note, ...(status === 'callback' ? { callback_date: date } : {}) })}
            className="lg:max-w-xs"
          />
        </div>
      )}
    </Card>
  );
}
