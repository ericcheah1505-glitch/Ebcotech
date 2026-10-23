'use client';

import { useState } from 'react';
import { useAuth } from '@/lib/auth';
import { PageHeader } from '@/components/AppShell';
import { IncentiveReportView, InstalledModelsView, usePeriod } from '@/components/Reports';
import { Chips, Screen } from '@/components/ui';

// Phone tab "Incentive" (salesmen: "Installed"), with the same Incentive / Installed models switch as the app.
export default function Incentive() {
  const { user } = useAuth();
  const isSales = user?.role === 'salesman';
  const [view, setView] = useState<'incentive' | 'models'>(isSales ? 'models' : 'incentive');
  const { range, picker } = usePeriod();
  return (
    <>
      <PageHeader title={isSales ? 'Installed' : 'Incentive'} />
      <Screen wide>
        {!isSales && (
          <div className="lg:hidden">
            <Chips
              options={[
                { value: 'incentive', label: '💰 Incentive' },
                { value: 'models', label: '🚪 Installed models' },
              ]}
              value={view}
              onChange={setView}
            />
          </div>
        )}
        {picker}
        {view === 'incentive' ? <IncentiveReportView range={range} /> : <InstalledModelsView range={range} />}
      </Screen>
    </>
  );
}
