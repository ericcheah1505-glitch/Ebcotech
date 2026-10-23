import { useEffect, useState } from 'react';
import { Alert, Switch, Text, View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { niceDate, todayStr } from '@/lib/format';
import type { JobDetail, JobSummary, JobType, User } from '@/lib/types';
import { Button, Card, Chips, DateField, Field, Loading, Muted, Screen, Title } from '@/components/ui';
import { ChoiceWithOther } from '@/components/ReportFields';
import { DOOR_VARIANTS, HOUSE_BRAND, PRODUCT_BRANDS, PRODUCT_MODELS, VARIANT_MODELS } from '@/lib/catalog';

export default function EditJob() {
  const { id } = useLocalSearchParams<{ id?: string }>();
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
        Alert.alert('Error', e.message);
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
    if (!jobTypeId || !customer.trim()) return Alert.alert('Job type and customer name are required');
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
      router.dismiss();
      if (!id) router.push(`/job/${job.id}`);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setBusy(false);
    }
  };

  const techs = staff.filter((u) => u.role === 'technician');
  const salesmen = staff.filter((u) => u.role === 'salesman');

  return (
    <Screen>
      <Stack.Screen options={{ title: id ? 'Edit job' : 'Post new job' }} />
      <Chips label="Job type *" options={types.map((t) => ({ value: t.id, label: t.name }))} value={jobTypeId} onChange={setJobTypeId} />
      <ChoiceWithOther label="Model (product type)" options={PRODUCT_MODELS} value={model} onChange={setModel} />
      {model && VARIANT_MODELS.includes(model) && (
        <Chips
          label="Single or double door"
          options={DOOR_VARIANTS.map((v) => ({ value: v, label: v === 'SINGLE' ? 'Single' : 'Double' }))}
          value={variant}
          onChange={setVariant}
        />
      )}
      <ChoiceWithOther label="Brand" options={PRODUCT_BRANDS} value={brand} onChange={setBrand} />
      <Field label="Invoice customer name *" value={customer} onChangeText={setCustomer} />
      <Field label="INV / DO No." value={invDo} onChangeText={setInvDo} autoCapitalize="characters" placeholder="e.g. CS-003984" />
      <Field label="Contact phone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
      <Field label="Site contact (name, phone)" value={siteContact} onChangeText={setSiteContact} />
      <Field label="Owner name" value={ownerName} onChangeText={setOwnerName} />
      <Field label="Site location (address)" value={address} onChangeText={setAddress} multiline />
      <Chips
        label="Location"
        options={[
          { value: 'local', label: 'Local' },
          { value: 'outstation', label: 'Outstation' },
        ]}
        value={outstation ? 'outstation' : 'local'}
        onChange={(v: string) => setOutstation(v === 'outstation')}
      />
      <Field label="Problems / job description" value={description} onChangeText={setDescription} multiline placeholder="Problem reported, special instructions" />
      <Title>Schedule</Title>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <DateField label="Date" value={date} onChange={setDate} clearable />
        <DateField label="Time" mode="time" value={time} onChange={setTime} clearable />
      </View>
      <Chips
        multi
        label="Technicians (tap to assign)"
        options={techs.map((t) => ({ value: t.id, label: `${t.name} · ${t.grade === 'senior' ? 'Sr' : 'Jr'}` }))}
        value={techIds}
        onChange={setTechIds}
      />
      {warrantyHits.length > 0 && (
        <Card style={{ borderColor: '#B45309', borderWidth: 1 }}>
          <Text style={{ fontWeight: '700', color: '#B45309' }}>Still under warranty</Text>
          {warrantyHits.map((h) => (
            <Muted key={h.id}>
              {h.job_no} · {h.job_type} · warranty until {niceDate(h.warranty_end)}
            </Muted>
          ))}
        </Card>
      )}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 16 }}>Under warranty (no incentive)</Text>
          <Muted>Warranty claim – technicians get no incentive for this job.</Muted>
        </View>
        <Switch
          value={underWarranty}
          onValueChange={(v) => {
            setUnderWarranty(v);
            setWarrantyTouched(true);
          }}
        />
      </View>
      {user?.role === 'admin' && (
        <>
          <Field label="Job incentive limit (RM, optional)" value={cap} onChangeText={setCap} keyboardType="decimal-pad" placeholder="Blank = use job type's limit" />
          <Muted>For big jobs needing many people: if rates add up to more than this, it is shared equally.</Muted>
        </>
      )}
      {user?.role === 'admin' && (
        <Chips label="Salesman" options={salesmen.map((s) => ({ value: s.id, label: s.name }))} value={salesmanId} onChange={setSalesmanId} />
      )}
      {id && (
        <>
          <Field label="Warranty months (blank = job type default)" value={warranty} onChangeText={setWarranty} keyboardType="number-pad" />
          <Muted>Warranty end date is calculated automatically when the job is completed.</Muted>
        </>
      )}
      <Button title={id ? 'Save changes' : 'Post job'} onPress={save} loading={busy} />
    </Screen>
  );
}
