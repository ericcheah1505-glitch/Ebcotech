import { Text, type ColorValue } from 'react-native';
import { Tabs } from 'expo-router/js-tabs';
import { useAuth } from '@/lib/auth';
import { C } from '@/components/ui';

const icon = (glyph: string) =>
  function TabIcon({ color }: { color: ColorValue }) {
    return <Text style={{ fontSize: 20, color }}>{glyph}</Text>;
  };

export default function TabsLayout() {
  const { user, settings } = useAuth();
  const isSales = user?.role === 'salesman';
  const salesCanSeeInstalled = settings.salesman_installed_report !== 'off';
  return (
    <Tabs screenOptions={{ tabBarActiveTintColor: C.primary, headerTitleStyle: { fontWeight: '700' } }}>
      <Tabs.Screen name="index" options={{ title: 'Today', tabBarIcon: icon('🗓') }} />
      <Tabs.Screen name="jobs" options={{ title: 'Jobs', tabBarIcon: icon('🛠') }} />
      <Tabs.Screen
        name="incentive"
        options={{
          title: isSales ? 'Installed' : 'Incentive',
          tabBarIcon: icon(isSales ? '🚪' : '💰'),
          href: isSales && !salesCanSeeInstalled ? null : undefined,
        }}
      />
      <Tabs.Screen name="more" options={{ title: 'More', tabBarIcon: icon('☰') }} />
    </Tabs>
  );
}
