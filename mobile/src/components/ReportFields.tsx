import { View } from 'react-native';
import { Chips, Field } from './ui';

const OTHERS = '__others__';

// Single choice from a fixed list, or free text under "Others".
export function ChoiceWithOther({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: string[];
  value: string | null | undefined;
  onChange: (v: string | null) => void;
}) {
  const isOther = !!value && !options.includes(value);
  const selected = !value ? null : isOther ? OTHERS : value;
  return (
    <View style={{ gap: 6 }}>
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
        // Show the text exactly as typed (no trimming while typing, or spaces vanish); ' ' means
        // "Others chosen, nothing typed yet". Callers trim when saving.
        <Field label={`${label} – others`} value={value === ' ' ? '' : (value ?? '')} onChangeText={(t) => onChange(t === '' ? ' ' : t)} placeholder="Type here" />
      )}
    </View>
  );
}
