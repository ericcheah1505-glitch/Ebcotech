import { useCallback, useState } from 'react';
import { Pressable, RefreshControl, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { niceDate, rm, toDateStr, todayStr } from '@/lib/format';
import type { IncentiveReport, InstalledReport, JobType } from '@/lib/types';
import { C, Card, Chips, DateField, Empty, Muted, Screen } from '@/components/ui';
import { InstalledModels } from '@/components/InstalledModels';

function monthRange(offset: number) {
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const last = new Date(now.getFullYear(), now.getMonth() + offset + 1, 0);
  return { from: toDateStr(first), to: offset === 0 ? todayStr() : toDateStr(last) };
}

export default function Incentive() {
  const { user } = useAuth();
  const [period, setPeriod] = useState<'this' | 'last' | 'custom'>('this');
  const [range, setRange] = useState(monthRange(0));
  const isSales = user?.role === 'salesman';
  const [view, setView] = useState<'incentive' | 'models'>(isSales ? 'models' : 'incentive');
  const [report, setReport] = useState<IncentiveReport | null>(null);
  const [installed, setInstalled] = useState<InstalledReport | null>(null);
  const [jobTypes, setJobTypes] = useState<JobType[]>([]);
  const [jobTypeId, setJobTypeId] = useState<number | null>(null); // 0 = all job types
  const [open, setOpen] = useState<number | null>(user?.role === 'technician' ? user.id : null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      if (view === 'incentive') {
        setReport(await api<IncentiveReport>(`/incentives?from=${range.from}&to=${range.to}`));
      } else {
        let typeId = jobTypeId;
        if (typeId === null) {
          // First time: default to the Installation job type.
          const types = (await api<JobType[]>('/job-types')).filter((t) => t.active);
          setJobTypes(types);
          typeId = types.find((t) => /install/i.test(t.name))?.id ?? 0;
          setJobTypeId(typeId);
        }
        const type = typeId ? `&job_type_id=${typeId}` : '';
        setInstalled(await api<InstalledReport>(`/reports/installed?from=${range.from}&to=${range.to}${type}`));
      }
      setError('');
    } catch (e: any) {
      setError(e.message);
    }
  }, [range, view, jobTypeId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const choose = (p: 'this' | 'last' | 'custom') => {
    setPeriod(p);
    if (p !== 'custom') setRange(monthRange(p === 'this' ? 0 : -1));
  };

  return (
    <Screen
      refresh={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={async () => {
            setRefreshing(true);
            await load();
            setRefreshing(false);
          }}
        />
      }>
      {!isSales && (
        <Chips
          options={[
            { value: 'incentive', label: '💰 Incentive' },
            { value: 'models', label: '🚪 Installed models' },
          ]}
          value={view}
          onChange={setView}
        />
      )}
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
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <DateField label="From" value={range.from} onChange={(v) => v && setRange((r) => ({ ...r, from: v }))} />
          <DateField label="To" value={range.to} onChange={(v) => v && setRange((r) => ({ ...r, to: v }))} />
        </View>
      )}
      <Muted>
        Completed jobs {niceDate(range.from)} – {niceDate(range.to)}
      </Muted>
      {error ? <Text style={{ color: C.danger }}>{error}</Text> : null}

      {view === 'models' && (
        <InstalledModels report={installed} jobTypes={jobTypes} jobTypeId={jobTypeId ?? 0} onJobType={setJobTypeId} />
      )}

      {view === 'incentive' && report && (
        <>
          {user?.role === 'admin' && (
            <Card>
              <Muted>Total incentive payable</Muted>
              <Text style={{ fontSize: 26, fontWeight: '800' }}>{rm(report.grand_total)}</Text>
            </Card>
          )}
          {report.technicians.length === 0 && <Empty text="No completed jobs in this period" />}
          {report.technicians.map((t) => (
            <Card key={t.technician_id}>
              <Pressable onPress={() => setOpen(open === t.technician_id ? null : t.technician_id)}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={{ fontWeight: '700', fontSize: 16 }}>
                    {t.name} <Text style={{ color: C.muted, fontWeight: '400' }}>({t.grade})</Text>
                  </Text>
                  <Text style={{ fontWeight: '800', fontSize: 16, color: C.success }}>{rm(t.total)}</Text>
                </View>
                <Muted>
                  {t.job_count} job(s) · base {rm(t.base_total)} · extras {rm(t.extras_total)} · adj {rm(t.adjustments_total)}
                </Muted>
              </Pressable>
              {open === t.technician_id &&
                t.jobs.map((j) => (
                  <Pressable
                    key={j.job_id}
                    onPress={() => router.push(`/job/${j.job_id}`)}
                    style={{ borderTopWidth: 1, borderTopColor: C.border, paddingTop: 8, marginTop: 8 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <Text style={{ fontWeight: '600', flex: 1 }}>
                        {j.job_no} · {j.customer_name}
                      </Text>
                      <Text style={{ fontWeight: '700' }}>{rm(j.total)}</Text>
                    </View>
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
                  </Pressable>
                ))}
            </Card>
          ))}
        </>
      )}
    </Screen>
  );
}
