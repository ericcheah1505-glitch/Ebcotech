'use client';

import { PageHeader } from '@/components/AppShell';
import { InstalledModelsView, usePeriod } from '@/components/Reports';
import { Screen } from '@/components/ui';

// PC menu: Installed models on its own page.
export default function Installed() {
  const { range, picker } = usePeriod();
  return (
    <>
      <PageHeader title="Installed models" back />
      <Screen wide>
        {picker}
        <InstalledModelsView range={range} />
      </Screen>
    </>
  );
}
