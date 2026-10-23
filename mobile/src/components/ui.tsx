import { useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { router } from 'expo-router';
import { niceDate, STATUS_COLOR, STATUS_LABEL, toDateStr } from '@/lib/format';
import type { JobStatus, JobSummary } from '@/lib/types';

export const C = {
  bg: '#F4F5F7',
  card: '#FFFFFF',
  text: '#111827',
  muted: '#6B7280',
  border: '#E5E7EB',
  primary: '#0B5FFF',
  danger: '#DC2626',
  success: '#16A34A',
};

export function Screen({ children, refresh }: { children: ReactNode; refresh?: ReactNode }) {
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: C.bg }}
      contentContainerStyle={{ padding: 16, paddingBottom: 48, gap: 12 }}
      keyboardShouldPersistTaps="handled"
      refreshControl={refresh as any}>
      {children}
    </ScrollView>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[s.card, style]}>{children}</View>;
}

export function Title({ children }: { children: ReactNode }) {
  return <Text style={s.title}>{children}</Text>;
}

export function Muted({ children }: { children: ReactNode }) {
  return <Text style={s.muted}>{children}</Text>;
}

export function Row({ label, value }: { label: string; value?: ReactNode }) {
  return (
    <View style={s.row}>
      <Text style={s.rowLabel}>{label}</Text>
      <Text style={s.rowValue}>{value || '-'}</Text>
    </View>
  );
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  disabled,
  loading,
  small,
}: {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger' | 'success';
  disabled?: boolean;
  loading?: boolean;
  small?: boolean;
}) {
  const bg = { primary: C.primary, secondary: '#E5E7EB', danger: C.danger, success: C.success }[variant];
  const fg = variant === 'secondary' ? C.text : '#fff';
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        s.button,
        small && s.buttonSmall,
        { backgroundColor: bg, opacity: disabled ? 0.5 : pressed ? 0.8 : 1 },
      ]}>
      {loading ? <ActivityIndicator color={fg} /> : <Text style={[s.buttonText, { color: fg }]}>{title}</Text>}
    </Pressable>
  );
}

export function Field({ label, ...props }: TextInputProps & { label: string }) {
  return (
    <View style={{ gap: 4 }}>
      <Text style={s.label}>{label}</Text>
      <TextInput
        placeholderTextColor="#9CA3AF"
        {...props}
        style={[s.input, props.multiline && { minHeight: 80, textAlignVertical: 'top' }, props.style]}
      />
    </View>
  );
}

export function Chips<T extends string | number>({
  label,
  options,
  value,
  onChange,
  multi,
}: {
  label?: string;
  options: { value: T; label: string }[];
  value: T | T[] | null;
  onChange: (v: any) => void;
  multi?: boolean;
}) {
  const selected = (v: T) => (multi ? (value as T[]).includes(v) : value === v);
  const toggle = (v: T) => {
    if (!multi) return onChange(v);
    const arr = value as T[];
    onChange(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  };
  return (
    <View style={{ gap: 4 }}>
      {label ? <Text style={s.label}>{label}</Text> : null}
      <View style={s.chips}>
        {options.map((o) => (
          <Pressable key={String(o.value)} onPress={() => toggle(o.value)} style={[s.chip, selected(o.value) && s.chipOn]}>
            <Text style={[s.chipText, selected(o.value) && { color: '#fff' }]}>{o.label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

export function DateField({
  label,
  value,
  onChange,
  mode = 'date',
  clearable,
}: {
  label: string;
  value: string | null;
  onChange: (v: string | null) => void;
  mode?: 'date' | 'time';
  clearable?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const current = (() => {
    const d = new Date();
    if (value && mode === 'date') {
      const [y, m, dd] = value.split('-').map(Number);
      return new Date(y, m - 1, dd);
    }
    if (value && mode === 'time') {
      const [h, mi] = value.split(':').map(Number);
      d.setHours(h, mi);
    }
    return d;
  })();
  const display = value ? (mode === 'date' ? niceDate(value) : value) : mode === 'date' ? 'Pick date' : 'Pick time';
  return (
    <View style={{ gap: 4, flex: 1 }}>
      <Text style={s.label}>{label}</Text>
      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
        <Pressable onPress={() => setOpen(true)} style={[s.input, { flex: 1, justifyContent: 'center' }]}>
          <Text style={{ color: value ? C.text : '#9CA3AF', fontSize: 16 }}>{display}</Text>
        </Pressable>
        {clearable && value ? <Button small variant="secondary" title="Clear" onPress={() => onChange(null)} /> : null}
      </View>
      {open && (
        <DateTimePicker
          value={current}
          mode={mode}
          is24Hour
          display={Platform.OS === 'ios' ? 'inline' : 'default'}
          onChange={(event, d) => {
            setOpen(Platform.OS === 'ios' && event.type !== 'set' ? true : false);
            if (event.type !== 'set' || !d) return;
            onChange(mode === 'date' ? toDateStr(d) : `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`);
          }}
        />
      )}
    </View>
  );
}

export function StatusBadge({ status, submitted }: { status: JobStatus; submitted?: boolean }) {
  // An in-progress job whose technician has submitted the report is waiting for the salesman.
  const waiting = status === 'in_progress' && submitted;
  return (
    <View style={[s.badge, { backgroundColor: waiting ? '#0E7490' : STATUS_COLOR[status] }]}>
      <Text style={s.badgeText}>{waiting ? 'Waiting salesman' : STATUS_LABEL[status]}</Text>
    </View>
  );
}

export function JobCard({ job, showDate = true }: { job: JobSummary; showDate?: boolean }) {
  return (
    <Pressable onPress={() => router.push(`/job/${job.id}`)} style={({ pressed }) => [s.card, pressed && { opacity: 0.7 }]}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <Text style={{ fontWeight: '700', fontSize: 16, flex: 1, color: C.text }} numberOfLines={1}>
          {job.customer_name}
        </Text>
        <StatusBadge status={job.status} submitted={!!job.submitted_at} />
      </View>
      <Text style={s.muted}>
        {job.job_no} · {job.job_type}
        {job.inv_do_no ? ` · INV/DO ${job.inv_do_no}` : ''}
        {job.contract_id ? ' · Contract' : ''}
      </Text>
      {showDate || job.scheduled_time ? (
        <Text style={{ color: C.text }}>
          {showDate ? niceDate(job.scheduled_date) : ''} {job.scheduled_time ?? ''}
        </Text>
      ) : null}
      {job.address ? (
        <Text style={s.muted} numberOfLines={1}>
          {job.address}
        </Text>
      ) : null}
      <Text style={s.muted}>Tech: {job.technicians || 'Not assigned'}</Text>
      {job.status === 'kiv' && (
        <Text style={{ color: '#9333EA' }}>
          KIV: {job.kiv_reason}
          {job.kiv_follow_up_date ? ` (follow up ${niceDate(job.kiv_follow_up_date)})` : ''}
        </Text>
      )}
    </Pressable>
  );
}

export function Empty({ text }: { text: string }) {
  return <Text style={[s.muted, { textAlign: 'center', paddingVertical: 12 }]}>{text}</Text>;
}

export function Loading() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.bg }}>
      <ActivityIndicator size="large" color={C.primary} />
    </View>
  );
}

export const s = StyleSheet.create({
  card: {
    backgroundColor: C.card,
    borderRadius: 12,
    padding: 14,
    gap: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.border,
  },
  title: { fontSize: 18, fontWeight: '700', color: C.text, marginTop: 4 },
  muted: { color: C.muted, fontSize: 13 },
  label: { fontSize: 13, color: C.muted, fontWeight: '600' },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: C.text,
    minHeight: 46,
  },
  row: { flexDirection: 'row', paddingVertical: 4, gap: 12 },
  rowLabel: { width: 110, color: C.muted, fontSize: 14 },
  rowValue: { flex: 1, color: C.text, fontSize: 14 },
  button: { borderRadius: 10, paddingVertical: 13, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
  buttonSmall: { paddingVertical: 8, paddingHorizontal: 12 },
  buttonText: { fontWeight: '700', fontSize: 15 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingVertical: 7, paddingHorizontal: 12, borderRadius: 999, backgroundColor: '#E5E7EB' },
  chipOn: { backgroundColor: C.primary },
  chipText: { color: C.text, fontWeight: '600', fontSize: 13 },
  badge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  badgeText: { color: '#fff', fontSize: 12, fontWeight: '700' },
});
