'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { PageHeader } from '@/components/AppShell';
import { JobView } from '@/components/JobView';
import { LinkButton, Loading, Screen } from '@/components/ui';

function JobPage() {
  const id = Number(useSearchParams().get('id'));
  const { user } = useAuth();
  const [jobNo, setJobNo] = useState('Job');
  useEffect(() => {
    api<{ job_no: string }>(`/jobs/${id}`)
      .then((j) => setJobNo(j.job_no))
      .catch(() => {});
  }, [id]);
  return (
    <>
      <PageHeader title={jobNo} back right={user?.role !== 'technician' ? <LinkButton href={`/job/edit/?id=${id}`} title="Edit" variant="secondary" small /> : null} />
      <Screen>
        <JobView id={id} />
      </Screen>
    </>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<Loading />}>
      <JobPage />
    </Suspense>
  );
}
