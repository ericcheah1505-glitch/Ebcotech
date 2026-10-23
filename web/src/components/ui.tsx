'use client';

// Building blocks styled exactly like the phone app's (mobile/src/components/ui.tsx), so phone
// screens look the same; wide screens get more room via the page layouts.
import Link from 'next/link';
import type { ChangeEvent, ReactNode } from 'react';
import { niceDate, STATUS_COLOR, STATUS_LABEL } from '@/lib/format';
import type { JobStatus, JobSummary } from '@/lib/types';

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

export function Screen({ children, wide }: { children: ReactNode; wide?: boolean }) {
  return <div className={cx('mx-auto flex w-full flex-col gap-3 p-4 pb-12', wide ? 'max-w-[1400px]' : 'max-w-[720px]')}>{children}</div>;
}

export function Card({ children, className, style }: { children: ReactNode; className?: string; style?: React.CSSProperties }) {
  return (
    <div className={cx('flex flex-col gap-1 rounded-xl border-[0.5px] border-line bg-card p-[14px]', className)} style={style}>
      {children}
    </div>
  );
}

export function Title({ children }: { children: ReactNode }) {
  return <h2 className="mt-1 text-[18px] font-bold text-ink">{children}</h2>;
}

export function Muted({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx('text-[13px] text-muted', className)}>{children}</div>;
}

export function Row({ label, value, href }: { label: string; value?: ReactNode; href?: string }) {
  const v = <span className="flex-1 text-[14px] text-ink break-words">{value || '-'}</span>;
  return (
    <div className="flex gap-3 py-1">
      <span className="w-[110px] shrink-0 text-[14px] text-muted">{label}</span>
      {href && value ? (
        <a href={href} target={href.startsWith('http') ? '_blank' : undefined} rel="noreferrer" className="flex-1 text-[14px] text-ink break-words">
          {value}
        </a>
      ) : (
        v
      )}
    </div>
  );
}

type Variant = 'primary' | 'secondary' | 'danger' | 'success';
const VARIANT: Record<Variant, string> = {
  primary: 'bg-primary text-white',
  secondary: 'bg-line text-ink',
  danger: 'bg-danger text-white',
  success: 'bg-success text-white',
};

export function Button({
  title,
  onPress,
  variant = 'primary',
  disabled,
  loading,
  small,
  className,
}: {
  title: string;
  onPress?: () => void;
  variant?: Variant;
  disabled?: boolean;
  loading?: boolean;
  small?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onPress}
      disabled={disabled || loading}
      className={cx(
        'flex items-center justify-center rounded-[10px] font-bold text-[15px] transition-opacity active:opacity-80 disabled:opacity-50',
        small ? 'px-3 py-2' : 'px-4 py-[13px]',
        VARIANT[variant],
        className
      )}>
      {loading ? <Spinner light={variant !== 'secondary'} /> : title}
    </button>
  );
}

// A link that looks like a Button (for "+ Post new job", "Edit" etc.).
export function LinkButton({ href, title, variant = 'primary', small, className }: { href: string; title: string; variant?: Variant; small?: boolean; className?: string }) {
  return (
    <Link
      href={href}
      className={cx('flex items-center justify-center rounded-[10px] font-bold text-[15px] active:opacity-80', small ? 'px-3 py-2' : 'px-4 py-[13px]', VARIANT[variant], className)}>
      {title}
    </Link>
  );
}

export function Spinner({ light, big }: { light?: boolean; big?: boolean }) {
  return (
    <span
      className={cx('inline-block animate-spin rounded-full border-2 border-t-transparent', big ? 'h-8 w-8 border-primary' : 'h-5 w-5', light ? 'border-white' : !big && 'border-ink')}
      style={big ? { borderTopColor: 'transparent' } : undefined}
    />
  );
}

export function Label({ children }: { children: ReactNode }) {
  return <span className="text-[13px] font-semibold text-muted">{children}</span>;
}

export function Field({
  label,
  value,
  onChange,
  multiline,
  placeholder,
  type = 'text',
  inputMode,
  autoCapitalize,
  onEnter,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  multiline?: boolean;
  placeholder?: string;
  type?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode'];
  autoCapitalize?: string;
  onEnter?: () => void;
}) {
  const handle = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange(e.target.value);
  return (
    <label className="flex flex-col gap-1">
      <Label>{label}</Label>
      {multiline ? (
        <textarea className="field min-h-[80px] resize-y" value={value} onChange={handle} placeholder={placeholder} />
      ) : (
        <input
          className="field"
          value={value}
          onChange={handle}
          placeholder={placeholder}
          type={type}
          inputMode={inputMode}
          autoCapitalize={autoCapitalize}
          autoCorrect="off"
          onKeyDown={(e) => e.key === 'Enter' && onEnter?.()}
        />
      )}
    </label>
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
    <div className="flex flex-col gap-1">
      {label ? <Label>{label}</Label> : null}
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <button
            type="button"
            key={String(o.value)}
            onClick={() => toggle(o.value)}
            className={cx('rounded-full px-3 py-[7px] text-[13px] font-semibold', selected(o.value) ? 'bg-primary text-white' : 'bg-line text-ink')}>
            {o.label}
          </button>
        ))}
      </div>
    </div>
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
  return (
    <label className="flex min-w-0 flex-1 flex-col gap-1">
      <Label>{label}</Label>
      <div className="flex items-center gap-2">
        <input type={mode} className="field min-w-0 flex-1" value={value ?? ''} onChange={(e) => onChange(e.target.value || null)} />
        {clearable && value ? <Button small variant="secondary" title="Clear" onPress={() => onChange(null)} /> : null}
      </div>
    </label>
  );
}

export function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={value}
      onClick={() => onChange(!value)}
      className={cx('relative h-7 w-12 shrink-0 rounded-full transition-colors', value ? 'bg-primary' : 'bg-[#c7c9cf]')}>
      <span className={cx('absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all', value ? 'left-[22px]' : 'left-0.5')} />
    </button>
  );
}

export function StatusBadge({ status, submitted }: { status: JobStatus; submitted?: boolean }) {
  // An in-progress job whose technician has submitted the report is waiting for the salesman.
  const waiting = status === 'in_progress' && submitted;
  return (
    <span className="shrink-0 rounded-full px-2.5 py-[3px] text-[12px] font-bold text-white" style={{ backgroundColor: waiting ? '#0E7490' : STATUS_COLOR[status] }}>
      {waiting ? 'Waiting salesman' : STATUS_LABEL[status]}
    </span>
  );
}

export const jobHref = (id: number) => `/job/?id=${id}`;

export function JobCard({ job, showDate = true }: { job: JobSummary; showDate?: boolean }) {
  return (
    <Link href={jobHref(job.id)} className="flex flex-col gap-1 rounded-xl border-[0.5px] border-line bg-card p-[14px] active:opacity-70">
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 flex-1 truncate text-[16px] font-bold text-ink">{job.customer_name}</span>
        <StatusBadge status={job.status} submitted={!!job.submitted_at} />
      </div>
      <Muted>
        {job.job_no} · {job.job_type}
        {job.inv_do_no ? ` · INV/DO ${job.inv_do_no}` : ''}
        {job.contract_id ? ' · Contract' : ''}
      </Muted>
      {showDate || job.scheduled_time ? (
        <span className="text-ink">
          {showDate ? niceDate(job.scheduled_date) : ''} {job.scheduled_time ?? ''}
        </span>
      ) : null}
      {job.address ? <Muted className="truncate">{job.address}</Muted> : null}
      <Muted>Tech: {job.technicians || 'Not assigned'}</Muted>
      {job.status === 'kiv' && (
        <span className="text-kiv">
          KIV: {job.kiv_reason}
          {job.kiv_follow_up_date ? ` (follow up ${niceDate(job.kiv_follow_up_date)})` : ''}
        </span>
      )}
    </Link>
  );
}

export function Empty({ text }: { text: string }) {
  return <Muted className="py-3 text-center">{text}</Muted>;
}

export function Loading() {
  return (
    <div className="flex flex-1 items-center justify-center py-24">
      <Spinner big />
    </div>
  );
}

export function ErrorText({ text }: { text: string }) {
  return text ? <div className="text-danger">{text}</div> : null;
}

// Full-screen layer (used for the signing pad, report preview and photo viewer).
export function Overlay({ children, dark }: { children: ReactNode; dark?: boolean }) {
  return <div className={cx('fixed inset-0 z-50 flex flex-col', dark ? 'bg-black' : 'bg-bg')}>{children}</div>;
}
