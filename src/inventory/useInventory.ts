import { useCallback, useEffect, useState } from 'react';
import { DEFAULT_SETTINGS, type Item, type Location } from '../domain';
import { useRepository } from './repositoryContext';

/** Items with the soonest effective expiry first; items with no date go last, by name. */
export function sortByExpiry(items: readonly Item[]): Item[] {
  return [...items].sort((a, b) => {
    const da = a.effective_expiry;
    const db = b.effective_expiry;
    if (da && db && da !== db) return da < db ? -1 : 1;
    if (da && !db) return -1;
    if (!da && db) return 1;
    return a.name.localeCompare(b.name);
  });
}

/** Active items in one location plus the expiring-soon setting. Call `refresh` after a write. */
export function useInventory(location: Location) {
  const repo = useRepository();
  const [items, setItems] = useState<Item[] | null>(null);
  const [soonDays, setSoonDays] = useState(DEFAULT_SETTINGS.expiring_soon_days);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([repo.items.listActive(location), repo.settings.get()]).then(
      ([rows, settings]) => {
        if (cancelled) return;
        setItems(sortByExpiry(rows));
        setSoonDays(settings.expiring_soon_days);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [repo, location, version]);

  const refresh = useCallback(() => setVersion((v) => v + 1), []);
  return { items, soonDays, refresh };
}
