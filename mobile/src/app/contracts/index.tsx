import { useCallback, useState } from 'react';
import { Pressable, Text } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { api } from '@/lib/api';
import { niceDate } from '@/lib/format';
import type { Contract } from '@/lib/types';
import { Button, C, Card, Empty, Muted, Screen } from '@/components/ui';

export default function Contracts() {
  const [list, setList] = useState<Contract[]>([]);

  useFocusEffect(
    useCallback(() => {
      api<Contract[]>('/contracts').then(setList).catch(() => {});
    }, [])
  );

  return (
    <Screen>
      <Button title="+ New service contract" onPress={() => router.push('/contracts/edit')} />
      <Muted>A servicing job is created automatically 14 days before each due date and appears under Unassigned.</Muted>
      {list.length === 0 && <Empty text="No contracts yet" />}
      {list.map((c) => (
        <Pressable key={c.id} onPress={() => router.push({ pathname: '/contracts/edit', params: { id: c.id } })}>
          <Card style={{ opacity: c.active ? 1 : 0.5 }}>
            <Text style={{ fontWeight: '700', fontSize: 16, color: C.text }}>
              {c.customer_name}
              {c.active ? '' : ' (inactive)'}
            </Text>
            <Muted>
              {c.job_type} · every {c.interval_months} month(s)
            </Muted>
            <Text>Next service: {niceDate(c.next_service_date)}</Text>
            <Muted>
              Contract {niceDate(c.start_date)} – {c.end_date ? niceDate(c.end_date) : 'ongoing'}
            </Muted>
          </Card>
        </Pressable>
      ))}
    </Screen>
  );
}
