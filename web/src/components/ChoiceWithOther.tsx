'use client';

import { Chips, Field } from './ui';

const OTHERS = '__others__';

// Single choice from a fixed list, or free text under "Others".
export function ChoiceWithOther({ label, options, value, onChange }: { label: string; options: string[]; value: string | null | undefined; onChange: (v: string | null) => void }) {
  const isOther = !!value && !options.includes(value);
  const selected = !value ? null : isOther ? OTHERS : value;
  return (
    <div className="flex flex-col gap-1.5">
      <Chips
        label={label}
        options={[...options.map((o) => ({ value: o, label: o })), { value: OTHERS, label: 'Others' }]}
        value={selected}
        onChange={(v: string) => {
          if (v === selected) onChange(null); // tap again to clear
          else onChange(v === OTHERS ? ' ' : v);
        }}
      />
      {selected === OTHERS && (
        // ' ' means "Others chosen, nothing typed yet". Shown exactly as typed; trimmed when saving.
        <Field label={`${label} – others`} value={value === ' ' ? '' : (value ?? '')} onChange={(t) => onChange(t === '' ? ' ' : t)} placeholder="Type here" />
      )}
    </div>
  );
}
