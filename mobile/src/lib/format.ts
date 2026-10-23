import type { JobStatus } from './types';

const pad = (n: number) => String(n).padStart(2, '0');

export const toDateStr = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const todayStr = () => toDateStr(new Date());
export const addDays = (str: string, n: number) => {
  const [y, m, d] = str.split('-').map(Number);
  return toDateStr(new Date(y, m - 1, d + n));
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function niceDate(str?: string | null) {
  if (!str) return '-';
  const [y, m, d] = str.slice(0, 10).split('-').map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

export function niceDateTime(str?: string | null) {
  if (!str) return '-';
  return `${niceDate(str)} ${str.slice(11, 16)}`;
}

export const rm = (n: number) => `RM ${Number(n || 0).toFixed(2)}`;

export const STATUS_LABEL: Record<JobStatus, string> = {
  pending: 'Unassigned',
  assigned: 'Assigned',
  in_progress: 'In progress',
  kiv: 'KIV',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

export const STATUS_COLOR: Record<JobStatus, string> = {
  pending: '#8E8E93',
  assigned: '#1F6FEB',
  in_progress: '#D97706',
  kiv: '#9333EA',
  completed: '#16A34A',
  cancelled: '#DC2626',
};
