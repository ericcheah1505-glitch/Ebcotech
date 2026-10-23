import { useCallback, useState } from 'react';
import { Pressable, RefreshControl, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { niceDate, todayStr } from '@/lib/format';
import { scheduleJobReminders } from '@/lib/notify';
import type { JobSummary, Reminders } from '@/lib/types';
import { Button, C, Card, Empty, JobCard, Muted, Screen, Title } from '@/components/ui';

export default function Today() {
  const { user, refreshSettings } = useAuth();
  const [data, setData] = useState<Reminders | null>(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      refreshSettings();
      const r = await api<Reminders>('/reminders');
      setData(r);
      setError('');
      scheduleJobReminders(r);
    } catch (e: any) {
      setError(e.message);
    }
  }, [refreshSettings]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const refresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const staff = user?.role !== 'technician';

  return (
    <Screen refresh={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}>
      <Text style={{ fontSize: 22, fontWeight: '800', color: C.text }}>Hi, {user?.name}</Text>
      <Muted>{niceDate(todayStr())} · pull down to refresh</Muted>
      {error ? <Text style={{ color: C.danger }}>{error}</Text> : null}
      {staff && <Button title="+ Post new job" onPress={() => router.push('/job/edit')} />}

      {data && (
        <>
          {data.overdue.length > 0 && <Section title={`⚠️ Overdue (${data.overdue.length})`} jobs={data.overdue} />}
          <Section title={`Today (${data.today.length})`} jobs={data.today} empty="No jobs today" showDate={false} />
          <Section title={`Tomorrow (${data.tomorrow.length})`} jobs={data.tomorrow} empty="No jobs tomorrow" showDate={false} />
          <Section title={`KIV – waiting confirmation (${data.kiv.length})`} jobs={data.kiv} empty="No KIV jobs" />
          {data.awaiting_done && data.awaiting_done.length > 0 && (
            <Section title={`✍ Waiting for you to mark done (${data.awaiting_done.length})`} jobs={data.awaiting_done} />
          )}
          {data.unassigned && (
            <Section title={`Unassigned (${data.unassigned.length})`} jobs={data.unassigned} empty="All jobs assigned" />
          )}
          {data.awaiting_signature && data.awaiting_signature.length > 0 && (
            <Section title={`Awaiting salesman signature (${data.awaiting_signature.length})`} jobs={data.awaiting_signature} />
          )}
          {data.upcoming_contracts && (
            <>
              <Title>Contract servicing due in 30 days ({data.upcoming_contracts.length})</Title>
              {data.upcoming_contracts.length === 0 && <Empty text="None due" />}
              {data.upcoming_contracts.map((c) => (
                <Pressable key={c.id} onPress={() => router.push({ pathname: '/contracts/edit', params: { id: c.id } })}>
                  <Card>
                    <Text style={{ fontWeight: '700' }}>{c.customer_name}</Text>
                    <Muted>
                      Due {niceDate(c.next_service_date)} · every {c.interval_months} month(s) · {c.job_type}
                    </Muted>
                  </Card>
                </Pressable>
              ))}
            </>
          )}
          {data.warranty_expiring && data.warranty_expiring.length > 0 && (
            <>
              <Title>Warranty ending in 30 days ({data.warranty_expiring.length})</Title>
              <Muted>Good time to offer a service contract.</Muted>
              {data.warranty_expiring.map((j) => (
                <View key={j.id}>
                  <JobCard job={j} />
                  <Muted>Warranty ends {niceDate(j.warranty_end)}</Muted>
                </View>
              ))}
            </>
          )}
        </>
      )}
    </Screen>
  );
}

function Section({ title, jobs, empty, showDate = true }: { title: string; jobs: JobSummary[]; empty?: string; showDate?: boolean }) {
  return (
    <>
      <Title>{title}</Title>
      {jobs.length === 0 && empty ? <Empty text={empty} /> : null}
      {jobs.map((j) => (
        <JobCard key={j.id} job={j} showDate={showDate} />
      ))}
    </>
  );
}
