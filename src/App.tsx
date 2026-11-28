import { useState } from 'react';
import type { Repository } from './db';
import type { Location } from './domain';
import { InventoryScreen } from './inventory/InventoryScreen.tsx';
import { LOCATION_LABELS } from './inventory/locations.ts';
import { RepositoryContext } from './inventory/repositoryContext.ts';
import { LocationTabs, type LocationTab } from './LocationTabs.tsx';
import { UpdatePrompt } from './pwa/UpdatePrompt.tsx';
import { useOnlineStatus } from './pwa/useOnlineStatus.ts';

const TABS: readonly LocationTab[] = (Object.keys(LOCATION_LABELS) as Location[]).map((id) => ({
  id,
  label: LOCATION_LABELS[id],
}));

interface Props {
  /** Defaults to the app-wide repository. Tests pass one on a throwaway database. */
  repository?: Repository;
}

export function App({ repository }: Props) {
  const online = useOnlineStatus();
  const [selected, setSelected] = useState<Location>('fridge');

  return (
    <RepositoryContext.Provider value={repository ?? null}>
      <div className="app">
        <header className="app-header">
          <h1>Shelf Life</h1>
          {!online && (
            <span className="offline-badge" role="status">
              Offline
            </span>
          )}
        </header>

        <LocationTabs
          tabs={TABS}
          selected={selected}
          onSelect={(id) => setSelected(id as Location)}
        />

        <main role="tabpanel" id={`panel-${selected}`} aria-labelledby={`tab-${selected}`}>
          <InventoryScreen key={selected} location={selected} />
        </main>

        <UpdatePrompt />
      </div>
    </RepositoryContext.Provider>
  );
}
