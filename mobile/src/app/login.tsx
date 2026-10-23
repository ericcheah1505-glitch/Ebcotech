import { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Text, View } from 'react-native';
import { BUILT_IN_SERVER, getServerUrl, loadStoredSession } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { COMPANY_NAME } from '@/lib/report';
import { APP_VERSION } from '@/lib/version';
import { Button, C, Card, Field, Screen } from '@/components/ui';

export default function Login() {
  const { login, notice } = useAuth();
  const [server, setServer] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    loadStoredSession().then(() => setServer(getServerUrl()));
  }, []);

  const submit = async () => {
    if (!server || !username || !password) return Alert.alert('Please fill in all fields');
    setBusy(true);
    try {
      await login(server, username, password);
    } catch (e: any) {
      console.warn(`[login] ${username} at ${server} failed: ${e.message}`);
      Alert.alert('Login failed', e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen>
        <View style={{ height: 60 }} />
        <Text style={{ fontSize: 26, fontWeight: '800', color: C.text, textAlign: 'center' }}>{COMPANY_NAME}</Text>
        <Text style={{ color: C.muted, textAlign: 'center' }}>Job & technician management</Text>
        <Text style={{ color: C.muted, textAlign: 'center', marginBottom: 12, fontSize: 12 }}>{APP_VERSION}</Text>
        {notice ? (
          <Card style={{ borderColor: '#B45309', borderWidth: 1, marginBottom: 12 }}>
            <Text style={{ color: '#B45309' }}>{notice}</Text>
          </Card>
        ) : null}
        <Card style={{ gap: 12 }}>
          {!BUILT_IN_SERVER && (
            <Field
              label="Server address"
              value={server}
              onChangeText={setServer}
              placeholder="e.g. http://192.168.1.10:4000"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
            />
          )}
          <Field label="Username" value={username} onChangeText={(t) => setUsername(t.trim())} autoCapitalize="none" autoCorrect={false} />
          <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry onSubmitEditing={submit} />
          <Button title="Log in" onPress={submit} loading={busy} />
        </Card>
      </Screen>
    </KeyboardAvoidingView>
  );
}
