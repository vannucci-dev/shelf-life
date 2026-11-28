import Dexie, { type EntityTable } from 'dexie';
import type { Item, Product, Settings, SyncedRecord, UserProductOverride } from '../domain';

/**
 * IndexedDB schema (design §3 and §5, ADR-0002).
 *
 * Only the repository layer in this folder may import this module. The rest of
 * the app goes through `createRepository()` so that every write stamps
 * `updated_at` and lands in the outbox. ESLint enforces this.
 */

/** Settings as stored: one synced row per owner, keyed by `id = owner_id`. */
export type StoredSettings = Settings & SyncedRecord;

/** Tables whose rows sync to Supabase through the outbox. `products` is a server-owned cache. */
export const SYNCED_TABLES = ['items', 'settings', 'overrides'] as const;
export type SyncedTable = (typeof SYNCED_TABLES)[number];

/**
 * One pending change for the sync engine (task 9). The key is `table:record_id`,
 * so repeated edits to a record collapse into one entry. The engine reads the
 * current row at push time, which always carries the newest `updated_at` and
 * any `deleted_at`.
 */
export interface OutboxEntry {
  key: string;
  table: SyncedTable;
  record_id: string;
  queued_at: string;
}

export const DB_NAME = 'shelf-life';

export class ShelfLifeDB extends Dexie {
  items!: EntityTable<Item, 'id'>;
  settings!: EntityTable<StoredSettings, 'id'>;
  products!: EntityTable<Product, 'barcode'>;
  overrides!: EntityTable<UserProductOverride, 'id'>;
  outbox!: EntityTable<OutboxEntry, 'key'>;

  constructor(name: string = DB_NAME) {
    super(name);
    // Only indexed fields are listed. Add a new version() for any change; never edit v1.
    this.version(1).stores({
      items: 'id, owner_id, [owner_id+status], location, product_id, effective_expiry, updated_at',
      settings: 'id, updated_at',
      products: 'barcode, fetched_at',
      overrides: 'id, &[owner_id+barcode], updated_at',
      outbox: 'key, queued_at',
    });
  }
}
