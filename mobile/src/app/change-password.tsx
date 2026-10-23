import { useState } from 'react';
import { Alert } from 'react-native';
import { router, Stack } from 'expo-router';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Button, Card, Field, Muted, Screen, Title } from '@/components/ui';

// Everyone chooses their own password. Shown automatically (and nothing else is available) when
// the person is still using a temporary password admin gave them.
export default function ChangePassword() {
  const { user, passwordChanged, logout } = useAuth();
  const forced = !!user?.must_change_password;
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (next.length < 6) return Alert.alert('Password must be at least 6 characters');
    if (next !== again) return Alert.alert('The two new passwords are not the same');
    setBusy(true);
    try {
      await api('/me/password', { body: { current_password: current, new_password: next } });
      passwordChanged();
      if (forced) return; // the app opens normally now
      Alert.alert('Password changed', 'Your other phones (if any) were logged out.');
      router.back();
    } catch (e: any) {
      Alert.alert('Not changed', e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Change password', headerBackVisible: !forced, gestureEnabled: !forced }} />
      <Card style={{ gap: 12 }}>
        <Title>{forced ? `Welcome, ${user?.name}` : 'Change my password'}</Title>
        <Muted>
          {forced
            ? 'You are using a temporary password from admin. Choose your own password to continue – nobody else, including admin, will know it.'
            : 'Choose a password only you know. At least 6 characters.'}
        </Muted>
        <Field label={forced ? 'Temporary password' : 'Current password'} value={current} onChangeText={setCurrent} secureTextEntry />
        <Field label="New password" value={next} onChangeText={setNext} secureTextEntry />
        <Field label="New password again" value={again} onChangeText={setAgain} secureTextEntry onSubmitEditing={save} />
        <Button title="Save new password" onPress={save} loading={busy} />
        {forced && <Button variant="secondary" title="Log out" onPress={logout} />}
      </Card>
    </Screen>
  );
}
