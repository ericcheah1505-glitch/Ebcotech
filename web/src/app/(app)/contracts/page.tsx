'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { niceDate } from '@/lib/format';
import type { Contract } from '@/lib/types';
import { PageHeader } from '@/components/AppShell';
import { Card, cx, Empty, LinkButton, Muted, Screen } from '@/components/ui';

export default function Contracts() {
  const [list, setList] = useState<Contract[]>([]);
  useEffect(() => {
    api<Contract[]>('/contracts').then(setList).catch(() => {});
  }, []);
  return (
    <>
      <PageHeader title="Service contracts" back />
      <Screen wide>
        <LinkButton href="/contracts/edit/" title="+ New service contract" className="lg:max-w-xs" />
        <Muted>A servicing job is created automatically 14 days before each due date and appears under Unassigned.</Muted>
        {list.length === 0 && <Empty text="No contracts yet" />}
        <div className="flex flex-col gap-3 lg:grid lg:grid-cols-3">
          {list.map((c) => (
            <Link key={c.id} href={`/contracts/edit/?id=${c.id}`}>
              <Card className={cx(!c.active && 'opacity-50')}>
                <span className="text-[16px] font-bold text-ink">
                  {c.customer_name}
                  {c.active ? '' : ' (inactive)'}
                </span>
                <Muted>
                  {c.job_type} · every {c.interval_months} month(s)
                </Muted>
                <span>Next service: {niceDate(c.next_service_date)}</span>
                <Muted>
                  Contract {niceDate(c.start_date)} – {c.end_date ? niceDate(c.end_date) : 'ongoing'}
                </Muted>
              </Card>
            </Link>
          ))}
        </div>
      </Screen>
    </>
  );
}
