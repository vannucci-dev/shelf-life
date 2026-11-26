import { useState } from 'react';
import { LocationTabs, type LocationTab } from './LocationTabs.tsx';
import { UpdatePrompt } from './pwa/UpdatePrompt.tsx';
import { useOnlineStatus } from './pwa/useOnlineStatus.ts';

const LOCATIONS: readonly LocationTab[] = [
  { id: 'fridge', label: 'Fridge' },
  { id: 'freezer', label: 'Freezer' },
  { id: 'pantry', label: 'Pantry' },
  { id: 'spice_rack', label: 'Spice rack' },
];

export function App() {
  const online = useOnlineStatus();
  const [selected, setSelected] = useState(LOCATIONS[0]!.id);
  const current = LOCATIONS.find((l) => l.id === selected) ?? LOCATIONS[0]!;

  return (
    <div className="app">
      <header className="app-header">
        <h1>Shelf Life</h1>
        {!online && (
          <span className="offline-badge" role="status">
            Offline
          </span>
        )}
      </header>

      <LocationTabs tabs={LOCATIONS} selected={selected} onSelect={setSelected} />

      <main
        className="empty-state"
        role="tabpanel"
        id={`panel-${current.id}`}
        aria-labelledby={`tab-${current.id}`}
      >
        <p>Nothing in the {current.label.toLowerCase()} yet.</p>
        <p className="muted">Items you add will show up here, even when you're offline.</p>
      </main>

      <UpdatePrompt />
    </div>
  );
}
