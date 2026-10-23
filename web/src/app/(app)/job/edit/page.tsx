'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { DOOR_VARIANTS, HOUSE_BRAND, PRODUCT_BRANDS, PRODUCT_MODELS, VARIANT_MODELS } from '@/lib/catalog';
import { niceDate, todayStr } from '@/lib/format';
import type { JobDetail, JobSummary, JobType, User } from '@/lib/types';
import { PageHeader } from '@/components/AppShell';
import { ChoiceWithOther } from '@/components/ChoiceWithOther';
import { Button, Card, Chips, DateField, Field, Loading, Muted, Screen, Title, Toggle } from '@/components/ui';

function EditJob() {
  const id = useSearchParams().get('id');
  const router = useRouter();
  const { user } = useAuth();
  const [types, setTypes] = useState<JobType[]>([]);
  const [staff, setStaff] = useState<User[]>([]);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);

  const [jobTypeId, setJobTypeId] = useState<number | null>(null);
  const [customer, setCustomer] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState<string | null>(todayStr());
  const [time, setTime] = useState<string | null>(null);
  const [techIds, setTechIds] = useState<number[]>([]);
  const [salesmanId, setSalesmanId] = useState<number | null>(user?.role === 'salesman' ? user.id : null);
  const [warranty, setWarranty] = useState('');
  const [underWarranty, setUnderWarranty] = useState(false);
  const [warrantyTouched, setWarrantyTouched] = useState(false);
  const [warrantyHits, setWarrantyHits] = useState<JobSummary[]>([]);
  const [cap, setCap] = useState('');
  const [model, setModel] = useState<string | null>(null);
  const [variant, setVariant] = useState<string | null>(null);
  const [brand, setBrand] = useState<string | null>(id ? null : HOUSE_BRAND);
  const [invDo, setInvDo] = useState('');
  const [siteContact, setSiteContact] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [outstation, setOutstation] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [t, u] = await Promise.all([api<JobType[]>('/job-types'), api<User[]>('/users')]);
        setTypes(t.filter((x) => x.active));
        setStaff(u.filter((x) => x.active));
        if (id) {
          const j = await api<JobDetail>(`/jobs/${id}`);
          setJobTypeId(j.job_type_id);
          setCustomer(j.customer_name);
          setPhone(j.customer_phone ?? '');
          setAddress(j.address ?? '');
          setDescription(j.description ?? '');
          setDate(j.scheduled_date);
          setTime(j.scheduled_time);
          setTechIds(j.technicians.map((x) => x.id));
          setSalesmanId(j.salesman_id);
          setWarranty(j.warranty_months == null ? '' : String(j.warranty_months));
          setUnderWarranty(!!j.under_warranty);
          setWarrantyTouched(true);
          setCap(j.incentive_cap == null ? '' : String(j.incentive_cap));
          setModel(j.product_model);
          setVariant(j.product_variant);
          setBrand(j.product_brand);
          setInvDo(j.inv_do_no ?? '');
          setSiteContact(j.site_contact ?? '');
          setOwnerName(j.owner_name ?? '');
          setOutstation(!!j.outstation);
        }
      } catch (e: any) {
        alert(e.message);
      }
      setReady(true);
    })();
  }, [id]);

  // Look up earlier jobs for this customer/address that are still under warranty.
  useEffect(() => {
    if (!ready) return;
    const t = setTimeout(async () => {
      if (!customer.trim() && !address.trim()) {
        setWarrantyHits([]);
        return;
      }
      const params = new URLSearchParams({ customer: customer.trim(), address: address.trim(), date: date ?? todayStr(), exclude: id ?? '0' });
      try {
        const hits = await api<JobSummary[]>(`/jobs/warranty-check?${params}`);
        setWarrantyHits(hits);
        if (!warrantyTouched) setUnderWarranty(hits.length > 0);
      } catch {
        // hint only
      }
    }, 600);
    return () => clearTimeout(t);
  }, [ready, customer, address, date, id, warrantyTouched]);

  if (!ready) return <Loading />;

  const save = async () => {
    if (!jobTypeId || !customer.trim()) return alert('Job type and customer name are required');
    setBusy(true);
    try {
      const body = {
        job_type_id: jobTypeId,
        customer_name: customer.trim(),
        customer_phone: phone,
        address,
        description,
        scheduled_date: date,
        scheduled_time: time,
        technician_ids: techIds,
        salesman_id: salesmanId,
        under_warranty: underWarranty,
        product_model: model?.trim() || null,
        product_variant: model && VARIANT_MODELS.includes(model) ? variant : null,
        product_brand: brand?.trim() || null,
        inv_do_no: invDo.trim(),
        site_contact: siteContact.trim(),
        owner_name: ownerName.trim(),
        outstation,
        ...(user?.role === 'admin' ? { incentive_cap: cap } : {}),
        ...(id ? { warranty_months: warranty } : {}),
      };
      const job = await api<JobDetail>(id ? `/jobs/${id}` : '/jobs', { method: id ? 'PUT' : 'POST', body });
      if (id) router.back();
      else router.replace(`/job/?id=${job.id}`);
    } catch (e: any) {
      alert(e.message);
    } finally {
      setBusy(false);
    }
  };

  const techs = staff.filter((u) => u.role === 'technician');
  const salesmen = staff.filter((u) => u.role === 'salesman');

  return (
    <>
      <PageHeader title={id ? 'Edit job' : 'Post new job'} back />
      <Screen>
        <Chips label="Job type *" options={types.map((t) => ({ value: t.id, label: t.name }))} value={jobTypeId} onChange={setJobTypeId} />
        <ChoiceWithOther label="Model (product type)" options={PRODUCT_MODELS} value={model} onChange={setModel} />
        {model && VARIANT_MODELS.includes(model) && (
          <Chips label="Single or double door" options={DOOR_VARIANTS.map((v) => ({ value: v, label: v === 'SINGLE' ? 'Single' : 'Double' }))} value={variant} onChange={setVariant} />
        )}
        <ChoiceWithOther label="Brand" options={PRODUCT_BRANDS} value={brand} onChange={setBrand} />
        <div className="grid gap-3 lg:grid-cols-2">
          <Field label="Invoice customer name *" value={customer} onChange={setCustomer} />
          <Field label="INV / DO No." value={invDo} onChange={setInvDo} autoCapitalize="characters" placeholder="e.g. CS-003984" />
          <Field label="Contact phone" value={phone} onChange={setPhone} type="tel" />
          <Field label="Site contact (name, phone)" value={siteContact} onChange={setSiteContact} />
          <Field label="Owner name" value={ownerName} onChange={setOwnerName} />
        </div>
        <Field label="Site location (address)" value={address} onChange={setAddress} multiline />
        <Chips
          label="Location"
          options={[
            { value: 'local', label: 'Local' },
            { value: 'outstation', label: 'Outstation' },
          ]}
          value={outstation ? 'outstation' : 'local'}
          onChange={(v: string) => setOutstation(v === 'outstation')}
        />
        <Field label="Problems / job description" value={description} onChange={setDescription} multiline placeholder="Problem reported, special instructions" />
        <Title>Schedule</Title>
        <div className="flex gap-2">
          <DateField label="Date" value={date} onChange={setDate} clearable />
          <DateField label="Time" mode="time" value={time} onChange={setTime} clearable />
        </div>
        <Chips
          multi
          label="Technicians (tap to assign)"
          options={techs.map((t) => ({ value: t.id, label: `${t.name} · ${t.grade === 'senior' ? 'Sr' : 'Jr'}` }))}
          value={techIds}
          onChange={setTechIds}
        />
        {warrantyHits.length > 0 && (
          <Card className="border border-warn">
            <span className="font-bold text-warn">Still under warranty</span>
            {warrantyHits.map((h) => (
              <Muted key={h.id}>
                {h.job_no} · {h.job_type} · warranty until {niceDate(h.warranty_end)}
              </Muted>
            ))}
          </Card>
        )}
        <div className="flex items-center justify-between gap-2">
          <div className="flex-1">
            <div className="text-[16px]">Under warranty (no incentive)</div>
            <Muted>Warranty claim – technicians get no incentive for this job.</Muted>
          </div>
          <Toggle
            value={underWarranty}
            onChange={(v) => {
              setUnderWarranty(v);
              setWarrantyTouched(true);
            }}
          />
        </div>
        {user?.role === 'admin' && (
          <>
            <Field label="Job incentive limit (RM, optional)" value={cap} onChange={setCap} inputMode="decimal" placeholder="Blank = use job type's limit" />
            <Muted>For big jobs needing many people: if rates add up to more than this, it is shared equally.</Muted>
            <Chips label="Salesman" options={salesmen.map((s) => ({ value: s.id, label: s.name }))} value={salesmanId} onChange={setSalesmanId} />
          </>
        )}
        {id && (
          <>
            <Field label="Warranty months (blank = job type default)" value={warranty} onChange={setWarranty} inputMode="numeric" />
            <Muted>Warranty end date is calculated automatically when the job is completed.</Muted>
          </>
        )}
        <Button title={id ? 'Save changes' : 'Post job'} onPress={save} loading={busy} className="lg:max-w-xs" />
      </Screen>
    </>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<Loading />}>
      <EditJob />
    </Suspense>
  );
}
