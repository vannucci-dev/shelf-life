import { UpdatePrompt } from './pwa/UpdatePrompt.tsx';
import { useOnlineStatus } from './pwa/useOnlineStatus.ts';

const LOCATIONS = ['Fridge', 'Freezer', 'Pantry', 'Spice rack'] as const;

export function App() {
  const online = useOnlineStatus();

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

      <nav className="tabs" aria-label="Locations">
        {LOCATIONS.map((name, i) => (
          <button
            key={name}
            type="button"
            className="tab"
            aria-current={i === 0 ? 'page' : undefined}
          >
            {name}
          </button>
        ))}
      </nav>

      <main className="empty-state">
        <p>Nothing here yet.</p>
        <p className="muted">Items you add will show up here, even when you're offline.</p>
      </main>

      <UpdatePrompt />
    </div>
  );
}
