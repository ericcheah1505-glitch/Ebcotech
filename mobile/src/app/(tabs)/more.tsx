import { Alert, Pressable, Text } from 'react-native';
import { router, type Href } from 'expo-router';
import { getServerUrl } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { APP_VERSION } from '@/lib/version';
import { Button, C, Card, Muted, Screen } from '@/components/ui';

export default function More() {
  const { user, logout } = useAuth();
  const staff = user?.role === 'admin' || user?.role === 'salesman';
  const links: { title: string; desc: string; href: Href; show: boolean }[] = [
    { title: 'Change my password', desc: 'Choose a password only you know', href: '/change-password', show: true },
    { title: 'Service contracts', desc: 'Customers with scheduled servicing; jobs are auto-created before due date', href: '/contracts', show: staff },
    { title: 'Job types & incentive rates', desc: 'Senior/junior rates, warranty months, extra situations (welding etc.)', href: '/admin/rates', show: user?.role === 'admin' },
    { title: 'Settings', desc: 'What salesmen can see (Installed models report)', href: '/admin/settings', show: user?.role === 'admin' },
    { title: 'Staff', desc: 'Add salesmen & technicians, set senior/junior grade', href: '/admin/users', show: user?.role === 'admin' },
  ];
  return (
    <Screen>
      <Card>
        <Text style={{ fontSize: 18, fontWeight: '700' }}>{user?.name}</Text>
        <Muted>
          {user?.role}
          {user?.grade ? ` · ${user.grade}` : ''} · @{user?.username}
        </Muted>
        <Muted>Server: {getServerUrl()}</Muted>
        <Muted>App version: {APP_VERSION}</Muted>
      </Card>
      {links
        .filter((l) => l.show)
        .map((l) => (
          <Pressable key={l.title} onPress={() => router.push(l.href)}>
            <Card>
              <Text style={{ fontWeight: '700', fontSize: 16, color: C.text }}>{l.title} ›</Text>
              <Muted>{l.desc}</Muted>
            </Card>
          </Pressable>
        ))}
      <Button
        variant="danger"
        title="Log out"
        onPress={() =>
          Alert.alert('Log out?', '', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Log out', style: 'destructive', onPress: logout },
          ])
        }
      />
    </Screen>
  );
}
