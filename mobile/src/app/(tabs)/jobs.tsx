import { useCallback, useState } from 'react';
import { RefreshControl, Text } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { JobSummary } from '@/lib/types';
import { Button, C, Chips, Empty, Field, JobCard, Muted, Screen } from '@/components/ui';

const FILTERS = [
  { value: 'open', label: 'Open', status: 'pending,assigned,in_progress' },
  { value: 'kiv', label: 'KIV', status: 'kiv' },
  { value: 'completed', label: 'Completed', status: 'completed' },
  { value: 'cancelled', label: 'Cancelled', status: 'cancelled' },
  { value: 'all', label: 'All', status: '' },
];

export default function Jobs() {
  const { user } = useAuth();
  const [filter, setFilter] = useState('open');
  const [q, setQ] = useState('');
  const [jobs, setJobs] = useState<JobSummary[]>([]);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const status = FILTERS.find((f) => f.value === filter)!.status;
    const params = new URLSearchParams();
    // A search looks through every job (completed ones too), not just the selected tab.
    if (status && !q.trim()) params.set('status', status);
    if (q.trim()) params.set('q', q.trim());
    try {
      setJobs(await api<JobSummary[]>(`/jobs?${params}`));
      setError('');
    } catch (e: any) {
      setError(e.message);
    }
  }, [filter, q]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

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
      {user?.role !== 'technician' && <Button title="+ Post new job" onPress={() => router.push('/job/edit')} />}
      <Field
        label="Search"
        value={q}
        onChangeText={setQ}
        placeholder="INV / DO no., customer, job no., address"
        returnKeyType="search"
        autoCapitalize="characters"
        autoCorrect={false}
      />
      {q.trim() ? (
        <Muted>Searching all jobs</Muted>
      ) : (
        <Chips options={FILTERS.map(({ value, label }) => ({ value, label }))} value={filter} onChange={setFilter} />
      )}
      {error ? <Text style={{ color: C.danger }}>{error}</Text> : null}
      {jobs.length === 0 && <Empty text="No jobs" />}
      {jobs.map((j) => (
        <JobCard key={j.id} job={j} />
      ))}
    </Screen>
  );
}
