import { useEffect } from 'react';
import { router, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider, useAuth } from '@/lib/auth';
import { Loading } from '@/components/ui';

function RootStack() {
  const { user, ready } = useAuth();
  const mustChange = !!user?.must_change_password;
  // On a temporary password, the only screen available is "Change password".
  useEffect(() => {
    if (mustChange) router.replace('/change-password');
  }, [mustChange]);
  if (!ready) return <Loading />;
  const staff = user?.role === 'admin' || user?.role === 'salesman';
  return (
    <Stack screenOptions={{ headerBackTitle: 'Back' }}>
      <Stack.Protected guard={!user}>
        <Stack.Screen name="login" options={{ headerShown: false }} />
      </Stack.Protected>
      <Stack.Protected guard={!!user && !mustChange}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="job/[id]" options={{ title: 'Job' }} />
        <Stack.Protected guard={staff}>
          <Stack.Screen name="job/edit" options={{ title: 'Job', presentation: 'modal' }} />
          <Stack.Screen name="contracts/index" options={{ title: 'Service contracts' }} />
          <Stack.Screen name="contracts/edit" options={{ title: 'Service contract', presentation: 'modal' }} />
        </Stack.Protected>
        <Stack.Protected guard={user?.role === 'admin'}>
          <Stack.Screen name="admin/users" options={{ title: 'Staff' }} />
          <Stack.Screen name="admin/rates" options={{ title: 'Job types & incentive rates' }} />
          <Stack.Screen name="admin/settings" options={{ title: 'Settings' }} />
        </Stack.Protected>
      </Stack.Protected>
      <Stack.Protected guard={!!user}>
        <Stack.Screen name="change-password" options={{ title: 'Change password' }} />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <StatusBar style="dark" />
      <RootStack />
    </AuthProvider>
  );
}
