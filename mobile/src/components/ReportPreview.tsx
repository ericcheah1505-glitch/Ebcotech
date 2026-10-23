import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { previewReportHtml } from '@/lib/report';
import type { JobDetail } from '@/lib/types';
import { Button, C } from './ui';

// Full-screen view of the service report exactly as the customer will get it (with Before/After
// photos), so the salesman can check everything before signing.
export function ReportPreview({ job, visible, onClose, onSign }: { job: JobDetail; visible: boolean; onClose: () => void; onSign: () => void }) {
  const [html, setHtml] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    let alive = true;
    previewReportHtml(job)
      .then((h) => alive && setHtml(h))
      .catch((e) => alive && setError(e.message));
    return () => {
      alive = false;
      setHtml(null);
      setError(null);
    };
  }, [visible, job]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
        <View style={{ padding: 12, borderBottomWidth: 1, borderBottomColor: C.border }}>
          <Text style={{ fontSize: 17, fontWeight: '700' }}>Review report {job.job_no}</Text>
          <Text style={{ color: C.muted }}>Scroll through the report and photos, then sign. Pinch to zoom.</Text>
        </View>
        <View style={{ flex: 1, backgroundColor: '#fff' }}>
          {html ? (
            <WebView originWhitelist={['*']} source={{ html }} setBuiltInZoomControls={false} style={{ flex: 1 }} />
          ) : (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              {error ? <Text style={{ color: C.danger, padding: 16 }}>{error}</Text> : <ActivityIndicator size="large" color={C.primary} />}
              {!error && <Text style={{ color: C.muted }}>Loading report and photos…</Text>}
            </View>
          )}
        </View>
        <View style={{ flexDirection: 'row', gap: 8, padding: 12 }}>
          <View style={{ flex: 1 }}>
            <Button variant="secondary" title="Close" onPress={onClose} />
          </View>
          <View style={{ flex: 2 }}>
            <Button title={job.salesman_signature ? '✍ Sign again' : '✍ Sign now'} onPress={onSign} disabled={!html} />
          </View>
        </View>
      </SafeAreaView>
    </Modal>
  );
}
