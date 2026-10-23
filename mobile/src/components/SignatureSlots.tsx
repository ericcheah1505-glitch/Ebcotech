import { Image, Text, View } from 'react-native';
import { niceDateTime } from '@/lib/format';
import type { JobDetail } from '@/lib/types';
import { C, Muted } from './ui';

type Who = 'technician' | 'customer' | 'salesman';

// The report's signatures, each shown as signed (image) or "Not signed yet".
// `compact` lays them side by side (used above the signing pad).
export function SignatureSlots({ job, show = ['technician', 'customer', 'salesman'], compact }: { job: JobDetail; show?: Who[]; compact?: boolean }) {
  const slots: Record<Who, { label: string; img: string | null; caption: string }> = {
    technician: {
      label: 'Technician',
      img: job.technician_signature,
      caption: job.technicians.map((t) => t.name).join(', '),
    },
    customer: {
      label: 'Customer chop & signature',
      img: job.customer_signature,
      caption: job.customer_sign_name ?? '',
    },
    salesman: {
      label: 'Salesman / Supervisor',
      img: job.salesman_signature,
      caption: job.salesman_signature ? `${job.salesman_name ?? ''} · ${niceDateTime(job.salesman_signed_at)}` : '',
    },
  };
  return (
    <View style={{ flexDirection: compact ? 'row' : 'column', gap: compact ? 8 : 10 }}>
      {show.map((who) => {
        const s = slots[who];
        return (
          <View key={who} style={{ flex: compact ? 1 : undefined, gap: 2 }}>
            <Text style={{ fontWeight: '700', fontSize: compact ? 12 : 14, color: C.text }}>{s.label}</Text>
            <View
              style={{
                height: compact ? 56 : 90,
                width: '100%',
                backgroundColor: '#fff',
                borderWidth: 1,
                borderColor: s.img ? C.border : '#F59E0B',
                borderStyle: s.img ? 'solid' : 'dashed',
                borderRadius: 8,
                alignItems: 'center',
                justifyContent: 'center',
              }}>
              {s.img ? (
                <Image source={{ uri: s.img }} style={{ width: '100%', height: '100%' }} resizeMode="contain" />
              ) : (
                <Text style={{ color: '#B45309', fontSize: 12 }}>Not signed yet</Text>
              )}
            </View>
            {s.caption ? <Muted>{s.caption}</Muted> : null}
          </View>
        );
      })}
    </View>
  );
}
