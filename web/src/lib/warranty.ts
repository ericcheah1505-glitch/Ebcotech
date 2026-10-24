// Warranty wording, follow-up status colours and the WhatsApp / phone links of the follow-up page.
import { niceDate } from './format';
import type { FollowupStatus, WarrantyFollowup } from './types';

export const monthsLabel = (m: number) => (m <= 0 ? 'no warranty' : m % 12 === 0 ? `${m / 12} year${m > 12 ? 's' : ''}` : `${m} month${m === 1 ? '' : 's'}`);

export type FollowupShown = FollowupStatus | 'expired';

export const FOLLOWUP_LABEL: Record<FollowupShown, string> = {
  new: 'Not contacted',
  contacted: 'Contacted',
  quoted: 'Quoted',
  callback: 'Call back later',
  declined: 'Declined',
  booked: 'Booked',
  expired: 'Expired – no action',
};

export const FOLLOWUP_COLOR: Record<FollowupShown, string> = {
  new: '#8E8E93',
  contacted: '#1F6FEB',
  quoted: '#D97706',
  callback: '#9333EA',
  declined: '#6B7280',
  booked: '#16A34A',
  expired: '#DC2626',
};

// The first phone number in the text ("Ahmad 012-345 6789" -> "012-345 6789").
const firstNumber = (phone?: string | null) => String(phone ?? '').match(/\+?\d[\d\s-]{6,}\d/)?.[0] ?? null;

export const telNumber = (phone?: string | null) => firstNumber(phone)?.replace(/[\s-]/g, '') ?? null;

// WhatsApp needs the country code: 012-345 6789 -> 60123456789 (Malaysia); +65 ... stays as it is.
export function whatsappNumber(phone?: string | null) {
  const digits = firstNumber(phone)?.replace(/\D/g, '');
  if (!digits) return null;
  return digits.startsWith('0') ? `6${digits}` : digits;
}

// Ready-made message; the salesman can change it in WhatsApp before sending.
export function followupMessage(f: WarrantyFollowup, from: string) {
  const door = [f.product_model, f.product_variant].filter(Boolean).join(' ');
  return (
    `Hi ${f.customer_name}, this is ${from} from Ebcotech Machinery. ` +
    `The warranty for your auto door${door ? ` (${door})` : ''} ${f.days_left < 0 ? 'ended' : 'ends'} on ${niceDate(f.warranty_end)}. ` +
    'Would you like us to arrange servicing or a maintenance contract to keep it in good condition? Thank you.'
  );
}
