import { useRef, type ReactNode } from 'react';
import { Modal, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import SignatureScreen, { type SignatureViewRef } from 'react-native-signature-canvas';
import { Button, C } from './ui';

// Full-screen signing pad. Returns a PNG data URL via onSave.
export function SignaturePad({
  visible,
  title,
  header,
  onSave,
  onClose,
}: {
  visible: boolean;
  title: string;
  header?: ReactNode; // shown above the signing box, e.g. signatures already on the report
  onSave: (dataUrl: string) => void;
  onClose: () => void;
}) {
  const ref = useRef<SignatureViewRef>(null);
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
        <View style={{ padding: 16 }}>
          <Text style={{ fontSize: 18, fontWeight: '700' }}>{title}</Text>
          <Text style={{ color: C.muted }}>Sign inside the box below</Text>
        </View>
        {header ? <View style={{ paddingHorizontal: 16, paddingBottom: 12 }}>{header}</View> : null}
        <View style={{ flex: 1, marginHorizontal: 16, borderWidth: 1, borderColor: C.border, backgroundColor: '#fff' }}>
          <SignatureScreen
            ref={ref}
            onOK={(sig) => onSave(sig)}
            onEmpty={() => {}}
            autoClear={false}
            imageType="image/png"
            webStyle={`.m-signature-pad--footer { display: none; } .m-signature-pad { box-shadow: none; border: none; } body, html { height: 100%; }`}
          />
        </View>
        <View style={{ flexDirection: 'row', gap: 8, padding: 16 }}>
          <View style={{ flex: 1 }}>
            <Button variant="secondary" title="Cancel" onPress={onClose} />
          </View>
          <View style={{ flex: 1 }}>
            <Button variant="secondary" title="Clear" onPress={() => ref.current?.clearSignature()} />
          </View>
          <View style={{ flex: 1 }}>
            <Button title="Save" onPress={() => ref.current?.readSignature()} />
          </View>
        </View>
      </SafeAreaView>
    </Modal>
  );
}
