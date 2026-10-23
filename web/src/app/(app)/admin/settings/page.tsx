'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { AppSettings } from '@/lib/types';
import { PageHeader } from '@/components/AppShell';
import { Card, Chips, Muted, Screen, Title } from '@/components/ui';

export default function Settings() {
  const { settings, refreshSettings } = useAuth();
  const [saving, setSaving] = useState(false);

  const save = async (patch: Partial<AppSettings>) => {
    setSaving(true);
    try {
      await api('/settings', { method: 'PUT', body: patch });
      await refreshSettings();
    } catch (e: any) {
      alert(`Not saved\n${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <PageHeader title="Settings" back />
      <Screen>
        <Card className="gap-2">
          <Title>Salesmen: Installed models report</Title>
          <Muted>Lets salesmen open the &quot;Installed&quot; tab to see which models were installed in a period. They never see incentive amounts.</Muted>
          <Chips
            options={[
              { value: 'off', label: 'Off' },
              { value: 'own', label: 'Own jobs only' },
              { value: 'all', label: 'All jobs' },
            ]}
            value={settings.salesman_installed_report}
            onChange={(v: AppSettings['salesman_installed_report']) => !saving && save({ salesman_installed_report: v })}
          />
          <Muted>
            {settings.salesman_installed_report === 'off'
              ? 'Salesmen cannot see the report.'
              : settings.salesman_installed_report === 'own'
                ? 'Salesmen see only jobs they posted or are the salesman for.'
                : 'Salesmen see every completed job.'}{' '}
            Salesmen get the change after refreshing their Today page.
          </Muted>
        </Card>
        <Card className="gap-2">
          <Title>Log out after not using the app</Title>
          <Muted>Protects customer data on lost or shared phones. Time only counts while the app is closed or in the background – staff using it are never logged out mid-report.</Muted>
          <Chips
            options={[
              { value: '30', label: '30 minutes' },
              { value: '480', label: '8 hours' },
              { value: '10080', label: '7 days' },
              { value: '43200', label: '30 days' },
            ]}
            value={settings.session_idle_minutes}
            onChange={(v: AppSettings['session_idle_minutes']) => !saving && save({ session_idle_minutes: v })}
          />
        </Card>
      </Screen>
    </>
  );
}
