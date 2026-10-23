'use client';

// One job: details, actions, job report, photos, signatures, PDF, incentive and history.
// Same content and order as the phone app's job screen. On PC it also appears beside the jobs table.
import { useCallback, useEffect, useRef, useState } from 'react';
import { api, apiBlob } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { niceDate, niceDateTime, rm, todayStr } from '@/lib/format';
import type { ExtraItem, JobDetail, User } from '@/lib/types';
import { JobPhotos } from './JobPhotos';
import { ReportPreview } from './ReportPreview';
import { SignaturePad } from './SignaturePad';
import { SignatureSlots } from './SignatureSlots';
import { Button, Card, Chips, DateField, Field, Loading, Muted, Row, StatusBadge, Title } from './ui';

type Panel = null | 'kiv' | 'complete' | 'extra' | 'adjust' | 'reschedule';
type PdfCache = { key: string; file: Promise<File> } | null;

// The PDF is made on the server; fetched once per version of the report and reused for Share/Print.
function getPdf(job: JobDetail, ref: { current: PdfCache }) {
  const key = `${job.id}|${job.salesman_signed_at}|${job.photos.length}|${job.status}`;
  if (ref.current?.key !== key) {
    const file = apiBlob(`/jobs/${job.id}/report.pdf`).then((b) => new File([b], `Service-Report-${job.job_no}.pdf`, { type: 'application/pdf' }));
    ref.current = { key, file };
    file.catch(() => {
      if (ref.current?.key === key) ref.current = null;
    });
  }
  return ref.current.file;
}

export function JobView({ id, onChanged }: { id: number; onChanged?: () => void }) {
  const { user } = useAuth();
  const [job, setJobState] = useState<JobDetail | null>(null);
  const [extraItems, setExtraItems] = useState<ExtraItem[]>([]);
  const [panel, setPanel] = useState<Panel>(null);
  const [busy, setBusy] = useState(false);
  const [signing, setSigning] = useState<null | 'customer' | 'salesman' | 'technician'>(null);
  const [reviewing, setReviewing] = useState(false); // salesman reviews the full report before signing
  const [techSig, setTechSig] = useState<string | null>(null);
  const [custComment, setCustComment] = useState('');
  const [nightWork, setNightWork] = useState(false);
  const [kivReason, setKivReason] = useState('');
  const [kivDate, setKivDate] = useState<string | null>(null);
  const [workDone, setWorkDone] = useState('');
  const [remarks, setRemarks] = useState('');
  const [custName, setCustName] = useState('');
  const [custSig, setCustSig] = useState<string | null>(null);
  const [extraId, setExtraId] = useState<number | null>(null);
  const [extraQty, setExtraQty] = useState('1');
  const [extraNote, setExtraNote] = useState('');
  const [extraTech, setExtraTech] = useState<number>(0);
  const [adjTech, setAdjTech] = useState<number | null>(null);
  const [adjAmount, setAdjAmount] = useState('');
  const [adjReason, setAdjReason] = useState('');
  const [newDate, setNewDate] = useState<string | null>(todayStr());
  const [newTime, setNewTime] = useState<string | null>(null);
  const [newTechs, setNewTechs] = useState<number[]>([]);
  const [allTechs, setAllTechs] = useState<User[]>([]);
  const pdfRef = useRef<PdfCache>(null);

  const setJob = useCallback(
    (j: JobDetail) => {
      setJobState(j);
      onChanged?.();
    },
    [onChanged]
  );

  const load = useCallback(async () => {
    try {
      const j = await api<JobDetail>(`/jobs/${id}`);
      setJobState(j);
      setWorkDone(j.work_done || '');
      setCustComment(j.customer_comment || '');
      setCustName(j.customer_sign_name || '');
      setNightWork(!!j.night_work);
      setRemarks(j.remarks || '');
      setPanel(null);
    } catch (e: any) {
      alert(e.message);
    }
  }, [id]);

  useEffect(() => {
    load();
    api<ExtraItem[]>('/extra-items').then((x) => setExtraItems(x.filter((i) => i.active)));
  }, [load]);

  // Once signed, prepare the PDF in the background so Share opens the share menu straight away
  // (phones only allow it right after a tap).
  useEffect(() => {
    if (job?.salesman_signature && (job.status === 'completed' || job.submitted_at)) getPdf(job, pdfRef).catch(() => {});
  }, [job]);

  if (!job || !user) return <Loading />;

  const isTech = user.role === 'technician';
  const isAdmin = user.role === 'admin';
  const isStaff = !isTech;
  const open = ['pending', 'assigned', 'in_progress'].includes(job.status);
  const canWork = open || job.status === 'kiv';
  // Technician has sent the job report; only the salesman/admin can now mark the job as done.
  const submitted = job.status === 'in_progress' && !!job.submitted_at;
  const hasReport = submitted || job.status === 'completed';

  const run = async (fn: () => Promise<JobDetail | void>, after?: () => void) => {
    setBusy(true);
    try {
      const res = await fn();
      if (res) setJob(res);
      setPanel(null);
      after?.();
    } catch (e: any) {
      alert(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  };

  // Stores a technician/customer signature on the server right away (keeps the report form open).
  const saveSignature = async (body: object) => {
    setBusy(true);
    try {
      setJob(await api<JobDetail>(`/jobs/${job.id}/signatures`, { body }));
    } catch (e: any) {
      alert(`Signature not saved\n${e?.message ?? e}\nPlease sign again.`);
    } finally {
      setBusy(false);
    }
  };

  const setStatus = (status: string, extra: object = {}) => run(() => api<JobDetail>(`/jobs/${job.id}/status`, { body: { status, ...extra } }));

  const openConfirmKiv = async () => {
    if (panel === 'reschedule') return setPanel(null);
    setNewDate(job.kiv_follow_up_date ?? todayStr());
    setNewTime(job.scheduled_time ?? null);
    setNewTechs(job.technicians.map((t) => t.id));
    setPanel('reschedule');
    const users = await api<User[]>('/users').catch(() => [] as User[]);
    setAllTechs(users.filter((u) => u.role === 'technician' && u.active));
  };

  const fileName = `Service-Report-${job.job_no}.pdf`;
  const pdfFile = () => getPdf(job, pdfRef);
  const sharePdf = async () => {
    setBusy(true);
    try {
      const file = await pdfFile();
      if (navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: `Service report ${job.job_no}` });
          return;
        } catch (e: any) {
          if (e?.name === 'AbortError') return; // closed the share menu
        }
      }
      saveBlob(file, fileName); // PC (or no share menu): download the PDF
    } catch (e: any) {
      alert(e.message);
    } finally {
      setBusy(false);
    }
  };
  const printPdf = async () => {
    const tab = window.open('', '_blank');
    try {
      const url = URL.createObjectURL(await pdfFile());
      if (tab) tab.location.href = url;
      else saveBlob(await pdfFile(), fileName);
    } catch (e: any) {
      tab?.close();
      alert(e.message);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <Card>
        <div className="flex items-center justify-between gap-2">
          <span className="flex-1 text-[20px] font-extrabold">{job.customer_name}</span>
          <StatusBadge status={job.status} submitted={submitted} />
        </div>
        <Muted>
          {job.job_no} · {job.job_type}
          {job.contract_id ? ' · Service contract' : ''}
        </Muted>
        {!!job.under_warranty && <span className="font-bold text-warn">Under warranty – no incentive</span>}
        <Row label="Schedule" value={`${niceDate(job.scheduled_date)} ${job.scheduled_time ?? ''}`} />
        <Row label="Model / brand" value={[job.product_model, job.product_variant, job.product_brand].filter(Boolean).join(' · ')} />
        {job.inv_do_no && <Row label="INV / DO No." value={job.inv_do_no} />}
        {job.site_contact && <Row label="Site contact" value={job.site_contact} />}
        {job.owner_name && <Row label="Owner" value={job.owner_name} />}
        {!!job.outstation && <Row label="Location" value="Outstation" />}
        <Row label="Address" value={job.address ? `${job.address} 📍` : null} href={job.address ? `https://maps.google.com/?q=${encodeURIComponent(job.address)}` : undefined} />
        <Row label="Phone" value={job.customer_phone ? `${job.customer_phone} 📞` : null} href={job.customer_phone ? `tel:${job.customer_phone}` : undefined} />
        <Row label="Technicians" value={job.technicians.map((t) => `${t.name} (${t.grade})`).join(', ') || 'Not assigned'} />
        <Row label="Salesman" value={job.salesman_name} />
        <Row label="Description" value={job.description} />
        {job.started_at && <Row label="Started" value={niceDateTime(job.started_at)} />}
        {job.completed_at && <Row label="Completed" value={niceDateTime(job.completed_at)} />}
        {job.status === 'completed' && <Row label="Warranty" value={job.warranty_end ? `Until ${niceDate(job.warranty_end)} (${job.warranty_months} mth)` : 'None'} />}
        {job.work_done && <Row label="Work done" value={job.work_done} />}
        {job.remarks && <Row label="Remarks" value={job.remarks} />}
        {job.customer_comment && <Row label="Customer comment" value={job.customer_comment} />}
        {job.status === 'completed' && <Row label="Working time" value={job.night_work ? 'Night work' : 'Normal hour'} />}
      </Card>

      {submitted && (
        <Card className="border border-wait">
          <span className="font-bold text-wait">Job report submitted – waiting for salesman</span>
          <Muted>
            Finished on site {niceDateTime(job.submitted_at)}.{' '}
            {isStaff ? 'Check the report, sign it, then mark the job as done.' : 'The salesman will check it and mark the job as done.'}
          </Muted>
        </Card>
      )}

      {(hasReport || job.technician_signature || job.customer_signature) && (
        <Card className="gap-2">
          <Title>Signatures</Title>
          <SignatureSlots job={job} />
        </Card>
      )}

      {job.status === 'kiv' && (
        <Card className="border border-kiv">
          <span className="font-bold text-kiv">KIV – waiting for confirmation</span>
          <span>{job.kiv_reason}</span>
          {job.kiv_follow_up_date && <Muted>Follow up on {niceDate(job.kiv_follow_up_date)}</Muted>}
        </Card>
      )}

      <JobPhotos job={job} user={user} onChange={setJob} />

      {/* ---------- Actions ---------- */}
      <div className="flex flex-col gap-2">
        {isTech && job.status === 'assigned' && (
          <Button
            title="▶ Start job"
            loading={busy}
            onPress={() =>
              confirm('Start job?\nStart time will be recorded.\nThen, before touching anything, take the BEFORE photos (Photos → ① Before service).') &&
              setStatus('in_progress')
            }
          />
        )}
        {canWork && (
          <Button
            variant={isTech ? 'success' : 'secondary'}
            title={submitted ? '📝 Edit job report' : isTech ? '📝 Submit job report' : '📝 Fill job report'}
            onPress={() => setPanel(panel === 'complete' ? null : 'complete')}
          />
        )}
        {isStaff && hasReport && <Button title={job.salesman_signature ? '👁 Review report / sign again' : '✍ Review & sign report'} onPress={() => setReviewing(true)} />}
        {isStaff && canWork && (
          <>
            <Button
              variant="success"
              title="✓ Mark job as done"
              loading={busy}
              disabled={!job.salesman_signature}
              onPress={() =>
                confirm(
                  ['Mark job as done?', submitted ? '' : 'The technician has not submitted a job report yet.', 'Warranty and incentive will be counted.'].filter(Boolean).join('\n')
                ) && setStatus('completed')
              }
            />
            {!job.salesman_signature && (
              <Muted>
                {hasReport
                  ? 'Sign the report as salesman first – then you can mark the job as done.'
                  : 'Waiting for the technician’s job report. The salesman signs it before marking the job as done.'}
              </Muted>
            )}
          </>
        )}
        {open && <Button variant="secondary" title="Mark KIV (waiting confirmation)" onPress={() => setPanel(panel === 'kiv' ? null : 'kiv')} />}
        {isStaff && job.status === 'kiv' && <Button title="✓ Customer confirmed – schedule job" onPress={openConfirmKiv} />}
        {canWork && <Button variant="secondary" title="+ Extra situation (welding etc.)" onPress={() => setPanel(panel === 'extra' ? null : 'extra')} />}
        {hasReport && !job.salesman_signature && <Muted>The service report can be shared or printed once the salesman has signed it.</Muted>}
        {hasReport && !!job.salesman_signature && (
          <>
            <Button variant="secondary" title="📤 Share service report (PDF)" loading={busy} onPress={sharePdf} />
            <Button variant="secondary" title="🖨 Print / Save as PDF" onPress={printPdf} />
          </>
        )}
        {isStaff && canWork && <Button variant="danger" title="Cancel job" onPress={() => confirm('Cancel this job?') && setStatus('cancelled')} />}
      </div>

      {panel === 'kiv' && (
        <Card className="gap-2.5">
          <Title>Mark as KIV</Title>
          <Field label="What are we waiting for?" value={kivReason} onChange={setKivReason} multiline placeholder="e.g. Customer to confirm door size / quotation approval / parts" />
          <DateField label="Follow-up date (optional)" value={kivDate} onChange={setKivDate} clearable />
          <Button title="Save KIV" loading={busy} onPress={() => setStatus('kiv', { kiv_reason: kivReason, kiv_follow_up_date: kivDate })} />
        </Card>
      )}

      {panel === 'reschedule' && (
        <Card className="gap-2.5">
          <Title>Customer confirmed</Title>
          <Muted>The job goes straight onto the technicians&apos; schedule and reminders.</Muted>
          <div className="flex gap-2">
            <DateField label="New job date" value={newDate} onChange={setNewDate} />
            <DateField label="Time" mode="time" value={newTime} onChange={setNewTime} clearable />
          </div>
          <Chips
            multi
            label="Technicians"
            options={allTechs.map((t) => ({ value: t.id, label: `${t.name} · ${t.grade === 'senior' ? 'Sr' : 'Jr'}` }))}
            value={newTechs}
            onChange={setNewTechs}
          />
          <Button
            title="Schedule job"
            loading={busy}
            disabled={!newDate}
            onPress={() => run(() => api<JobDetail>(`/jobs/${job.id}/confirm-kiv`, { body: { scheduled_date: newDate, scheduled_time: newTime, technician_ids: newTechs } }))}
          />
        </Card>
      )}

      {panel === 'complete' && (
        <Card className="gap-2.5">
          <Title>Job report</Title>
          <Muted>Finish time is recorded when you submit. The salesman then checks it and marks the job as done.</Muted>
          <Field label="Work done" value={workDone} onChange={setWorkDone} multiline placeholder="What was installed / repaired / serviced" />
          <Chips
            label="Working time"
            options={[
              { value: 'normal', label: 'Normal hour' },
              { value: 'night', label: 'Night work' },
            ]}
            value={nightWork ? 'night' : 'normal'}
            onChange={(v: string) => setNightWork(v === 'night')}
          />
          <Field label="Remarks (optional)" value={remarks} onChange={setRemarks} multiline />
          <Field label="Customer comment (optional)" value={custComment} onChange={setCustComment} multiline />
          {techSig || job.technician_signature ? <img src={(techSig ?? job.technician_signature)!} alt="" className="h-[90px] bg-white object-contain" /> : null}
          <Button variant="secondary" title={techSig || job.technician_signature ? 'Redo technician signature' : 'Technician signature'} onPress={() => setSigning('technician')} />
          <Field label="Customer name (for signature)" value={custName} onChange={setCustName} />
          {custSig || job.customer_signature ? <img src={(custSig ?? job.customer_signature)!} alt="" className="h-[90px] bg-white object-contain" /> : null}
          <Button variant="secondary" title={custSig || job.customer_signature ? 'Redo customer signature' : 'Customer chop & signature (optional)'} onPress={() => setSigning('customer')} />
          <Button
            variant="success"
            title={submitted ? 'Update job report' : 'Submit job report'}
            loading={busy}
            onPress={() => {
              if (!workDone.trim()) return alert('Please fill in work done');
              if (!techSig && !job.technician_signature) return alert('Please add the technician signature');
              const missing = (['before', 'after'] as const).filter((st) => !job.photos.some((ph) => ph.stage === st));
              if (
                missing.length &&
                !confirm(
                  `No ${missing.map((m) => m.toUpperCase()).join(' or ')} photo yet\nPhotos protect you and the company. Press Cancel to add them under Photos, or OK to submit without them.`
                )
              )
                return;
              run(() =>
                api<JobDetail>(`/jobs/${job.id}/submit-report`, {
                  body: {
                    work_done: workDone,
                    remarks: remarks || undefined,
                    customer_sign_name: custName || undefined,
                    customer_signature: custSig || undefined,
                    technician_signature: techSig || undefined,
                    customer_comment: custComment || undefined,
                    night_work: nightWork,
                  },
                })
              );
            }}
          />
        </Card>
      )}

      {panel === 'extra' && (
        <Card className="gap-2.5">
          <Title>Add extra situation</Title>
          <Chips label="Situation" options={extraItems.map((e) => ({ value: e.id, label: e.name }))} value={extraId} onChange={setExtraId} />
          <Field label="Quantity" value={extraQty} onChange={setExtraQty} inputMode="decimal" />
          {job.technicians.length > 1 && (
            <Chips
              label="Applies to"
              options={[{ value: 0, label: 'All technicians' }, ...job.technicians.map((t) => ({ value: t.id, label: t.name }))]}
              value={extraTech}
              onChange={setExtraTech}
            />
          )}
          <Field label="Note (optional)" value={extraNote} onChange={setExtraNote} placeholder="e.g. welded bottom track" />
          <Button
            title="Add"
            loading={busy}
            disabled={!extraId}
            onPress={() =>
              run(
                () => api<JobDetail>(`/jobs/${job.id}/extras`, { body: { extra_item_id: extraId, qty: Number(extraQty) || 1, note: extraNote, technician_id: extraTech || null } }),
                () => {
                  setExtraId(null);
                  setExtraNote('');
                  setExtraQty('1');
                }
              )
            }
          />
        </Card>
      )}

      {job.extras.length > 0 && (
        <>
          <Title>Extra situations</Title>
          {job.extras.map((e) => (
            <Card key={e.id}>
              <div className="flex items-center justify-between gap-2">
                <div className="flex-1">
                  <div className="font-semibold">
                    {e.name} x{e.qty}
                  </div>
                  <Muted>
                    {e.technician_name ? `For ${e.technician_name}` : 'All technicians'}
                    {e.note ? ` · ${e.note}` : ''}
                  </Muted>
                </div>
                {(isAdmin || (e.created_by === user.id && job.status !== 'completed')) && (
                  <Button
                    small
                    variant="secondary"
                    title="Remove"
                    onPress={() => confirm('Remove this extra?') && run(() => api<JobDetail>(`/jobs/${job.id}/extras/${e.id}`, { method: 'DELETE' }))}
                  />
                )}
              </div>
            </Card>
          ))}
        </>
      )}

      {/* ---------- Incentive ---------- */}
      {job.incentive && job.incentive.length > 0 && (
        <>
          <Title>Incentive</Title>
          {job.incentive[0].under_warranty ? (
            <Muted>Warranty case – no incentive (admin adjustments still count).</Muted>
          ) : (
            !job.incentive[0].earns && <Muted>Incentive is counted once the job is completed.</Muted>
          )}
          {job.incentive[0].capped && (
            <Muted>
              Job limit {rm(job.incentive[0].cap ?? 0)} shared equally by {job.incentive.length} technicians.
            </Muted>
          )}
          {job.incentive.map((l) => (
            <Card key={l.technician_id}>
              <div className="flex justify-between">
                <span className="font-bold">
                  {l.name} ({l.grade})
                </span>
                <span className="font-extrabold text-success">{rm(l.total)}</span>
              </div>
              <Muted>Base: {rm(l.base)}</Muted>
              {l.extras.map((e) => (
                <Muted key={e.id}>
                  + {e.name} x{e.qty}: {rm(e.amount)}
                </Muted>
              ))}
              {l.adjustments.map((a) => (
                <div key={a.id} className="flex items-center gap-2">
                  <span className="flex-1 text-muted">
                    Adjustment {rm(a.amount)} — {a.reason}
                  </span>
                  {isAdmin && (
                    <button
                      type="button"
                      className="text-danger"
                      onClick={() => confirm('Remove adjustment?') && run(() => api<JobDetail>(`/jobs/${job.id}/adjustments/${a.id}`, { method: 'DELETE' }))}>
                      ✕
                    </button>
                  )}
                </div>
              ))}
            </Card>
          ))}
          {isAdmin && <Button variant="secondary" title="± Special-case adjustment" onPress={() => setPanel(panel === 'adjust' ? null : 'adjust')} />}
        </>
      )}

      {panel === 'adjust' && (
        <Card className="gap-2.5">
          <Title>Incentive adjustment</Title>
          <Muted>For special cases not covered by rates. Use a negative amount to deduct.</Muted>
          <Chips label="Technician" options={job.technicians.map((t) => ({ value: t.id, label: t.name }))} value={adjTech} onChange={setAdjTech} />
          <Field label="Amount (RM)" value={adjAmount} onChange={setAdjAmount} inputMode="decimal" placeholder="e.g. 20 or -10" />
          <Field label="Reason" value={adjReason} onChange={setAdjReason} placeholder="e.g. Job took 2 days, extra trip for parts" />
          <Button
            title="Save adjustment"
            loading={busy}
            disabled={!adjTech || !adjAmount || !adjReason}
            onPress={() =>
              run(
                () => api<JobDetail>(`/jobs/${job.id}/adjustments`, { body: { technician_id: adjTech, amount: Number(adjAmount), reason: adjReason } }),
                () => {
                  setAdjAmount('');
                  setAdjReason('');
                }
              )
            }
          />
        </Card>
      )}

      <Title>History</Title>
      <Card>
        {job.logs.map((l, i) => (
          <Muted key={i}>
            {niceDateTime(l.created_at)} · {l.user_name ?? 'System'} · {l.action.replace('_', ' ')}
            {l.note ? ` — ${l.note}` : ''}
          </Muted>
        ))}
      </Card>

      <ReportPreview
        job={job}
        visible={reviewing}
        onClose={() => setReviewing(false)}
        onSign={() => {
          setReviewing(false);
          setSigning('salesman');
        }}
      />
      <SignaturePad
        visible={signing !== null}
        header={signing === 'salesman' ? <SignatureSlots job={job} show={['technician', 'customer']} compact /> : null}
        title={signing === 'salesman' ? `Salesman signature – ${job.job_no}` : signing === 'technician' ? 'Technician signature' : 'Customer chop & signature'}
        onClose={() => setSigning(null)}
        onSave={(sig) => {
          const who = signing;
          setSigning(null);
          if (who === 'customer') {
            setCustSig(sig);
            saveSignature({ customer_signature: sig, customer_sign_name: custName || undefined });
          } else if (who === 'technician') {
            setTechSig(sig);
            saveSignature({ technician_signature: sig });
          } else run(() => api<JobDetail>(`/jobs/${job.id}/salesman-signature`, { body: { signature: sig } }));
        }}
      />
    </div>
  );
}

function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
