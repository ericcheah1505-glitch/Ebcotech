'use client';

import { niceDateTime } from '@/lib/format';
import type { JobDetail } from '@/lib/types';
import { cx, Muted } from './ui';

type Who = 'technician' | 'customer' | 'salesman';

// The report's signatures, each shown as signed (image) or "Not signed yet".
// `compact` lays them side by side (used above the signing pad).
export function SignatureSlots({ job, show = ['technician', 'customer', 'salesman'], compact }: { job: JobDetail; show?: Who[]; compact?: boolean }) {
  const slots: Record<Who, { label: string; img: string | null; caption: string }> = {
    technician: { label: 'Technician', img: job.technician_signature, caption: job.technicians.map((t) => t.name).join(', ') },
    customer: { label: 'Customer chop & signature', img: job.customer_signature, caption: job.customer_sign_name ?? '' },
    salesman: {
      label: 'Salesman / Supervisor',
      img: job.salesman_signature,
      caption: job.salesman_signature ? `${job.salesman_name ?? ''} · ${niceDateTime(job.salesman_signed_at)}` : '',
    },
  };
  return (
    <div className={cx('flex', compact ? 'flex-row gap-2' : 'flex-col gap-2.5 lg:grid lg:grid-cols-3')}>
      {show.map((who) => {
        const s = slots[who];
        return (
          <div key={who} className={cx('flex min-w-0 flex-col gap-0.5', compact && 'flex-1')}>
            <span className={cx('font-bold text-ink', compact ? 'text-[12px]' : 'text-[14px]')}>{s.label}</span>
            <div
              className={cx(
                'flex w-full items-center justify-center rounded-lg border bg-white',
                compact ? 'h-14' : 'h-[90px]',
                s.img ? 'border-line' : 'border-dashed border-[#F59E0B]'
              )}>
              {s.img ? <img src={s.img} alt={s.label} className="h-full w-full object-contain" /> : <span className="text-[12px] text-warn">Not signed yet</span>}
            </div>
            {s.caption ? <Muted>{s.caption}</Muted> : null}
          </div>
        );
      })}
    </div>
  );
}
