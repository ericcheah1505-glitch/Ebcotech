import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { niceDate } from '@/lib/format';
import type { InstalledReport, JobType } from '@/lib/types';
import { C, Card, Chips, Empty, Muted } from './ui';

const titleCase = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();

// Completed jobs in the period grouped by model (and single/double door); tap a model to see its jobs.
export function InstalledModels({
  report,
  jobTypes,
  jobTypeId,
  onJobType,
}: {
  report: InstalledReport | null;
  jobTypes: JobType[];
  jobTypeId: number;
  onJobType: (id: number) => void;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const typeName = jobTypes.find((t) => t.id === jobTypeId)?.name;
  const isInstall = !!typeName && /install/i.test(typeName);

  return (
    <>
      <Chips
        label="Job type"
        options={[...jobTypes.map((t) => ({ value: t.id, label: t.name })), { value: 0, label: 'All' }]}
        value={jobTypeId}
        onChange={onJobType}
      />
      {report && (
        <>
          <Card>
            <Muted>{isInstall ? 'Systems installed' : `${typeName ?? 'All'} jobs completed`}</Muted>
            <Text style={{ fontSize: 26, fontWeight: '800' }}>{report.total}</Text>
          </Card>
          {report.by_model.length === 0 && <Empty text="Nothing completed in this period" />}
          {report.by_model.map((g) => {
            const key = `${g.model ?? ''}|${g.variant ?? ''}`;
            return (
              <Card key={key}>
                <Pressable onPress={() => setOpen(open === key ? null : key)}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={{ fontWeight: '700', fontSize: 16, flex: 1, color: g.model ? C.text : C.muted }}>
                      {g.model ?? 'Model not recorded'}
                      {g.variant ? <Text style={{ fontWeight: '400', color: C.muted }}> · {titleCase(g.variant)} door</Text> : null}
                    </Text>
                    <Text style={{ fontWeight: '800', fontSize: 18, color: C.primary }}>{g.count}</Text>
                  </View>
                  <Muted>{open === key ? 'Tap to hide jobs' : 'Tap to see jobs'}</Muted>
                </Pressable>
                {open === key &&
                  g.jobs.map((j) => (
                    <Pressable
                      key={j.job_id}
                      onPress={() => router.push(`/job/${j.job_id}`)}
                      style={{ borderTopWidth: 1, borderTopColor: C.border, paddingTop: 8, marginTop: 8 }}>
                      <Text style={{ fontWeight: '600' }}>
                        {j.job_no} · {j.customer_name}
                      </Text>
                      <Muted>
                        Done {niceDate(j.completed_at)}
                        {j.inv_do_no ? ` · INV/DO ${j.inv_do_no}` : ''}
                        {jobTypeId === 0 ? ` · ${j.job_type}` : ''}
                      </Muted>
                      {j.address ? <Muted>{j.address}</Muted> : null}
                      <Muted>Tech: {j.technicians || '-'}</Muted>
                    </Pressable>
                  ))}
              </Card>
            );
          })}
        </>
      )}
    </>
  );
}
