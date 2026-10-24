'use client';

import { useState } from 'react';
import { monthsLabel } from '@/lib/warranty';
import { Chips, Field, Muted } from './ui';

// Warranty of one job: the job type's default, 1 year when an electronic part (controller, motor) is
// replaced on a service job, or another number of months for a special case.
// value: '' = the job type's default, otherwise the months as text.
export function WarrantyChoice({ typeMonths, value, onChange, note }: { typeMonths: number; value: string; onChange: (v: string) => void; note?: string }) {
  const showYear = typeMonths > 0 && typeMonths < 12;
  const derived = value === '' || Number(value) === typeMonths ? 'default' : showYear && value === '12' ? 'year' : 'other';
  const [otherOpen, setOtherOpen] = useState(derived === 'other');
  const mode = otherOpen ? 'other' : derived;
  return (
    <div className="flex flex-col gap-1.5">
      <Chips
        label="Warranty"
        options={[
          { value: 'default', label: `Default · ${monthsLabel(typeMonths)}` },
          ...(showYear ? [{ value: 'year', label: '1 year · controller / motor replaced' }] : []),
          { value: 'other', label: 'Other (special case)' },
        ]}
        value={mode}
        onChange={(v: string) => {
          setOtherOpen(v === 'other');
          if (v === 'default') onChange('');
          else if (v === 'year') onChange('12');
          else onChange(derived === 'other' ? value : '');
        }}
      />
      {mode === 'other' && (
        <Field label="Warranty months (special case)" value={value} onChange={(t) => onChange(t.replace(/\D/g, ''))} inputMode="numeric" placeholder="e.g. 6 or 24" />
      )}
      {showYear && <Muted>Service: 1 year only when an electronic part (controller, motor) is replaced – otherwise {monthsLabel(typeMonths)}.</Muted>}
      {note && <Muted>{note}</Muted>}
    </div>
  );
}
