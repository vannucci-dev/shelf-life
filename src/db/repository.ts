import {
  DEFAULT_SETTINGS,
  LOCATIONS,
  EXPIRY_KINDS,
  SHELF_LIFE_RULES,
  effectiveExpiry,
  isIsoDate,
  type Item,
  type Location,
  type Product,
  type Settings,
  type ShelfLifeRule,
  type UserProductOverride,
} from '../domain';
import { ShelfLifeDB, type OutboxEntry, type StoredSettings, type SyncedTable } from './schema';

/**
 * The repository layer: the only path to the local database (task 3, ADR-0002).
 *
 * Every write to a synced table, in one transaction:
 * - stamps `updated_at` (and `created_at` / `deleted_at` where relevant),
 * - re-derives `effective_expiry` for items,
 * - queues the record in the outbox for the sync engine.
 *
 * Nothing is hard-deleted; removal sets `deleted_at` so it can sync (Req 7.1).
 */

export class RepositoryError extends Error {
  constructor(
    message: string,
    readonly code: 'invalid' | 'not_found',
  ) {
    super(message);
    this.name = 'RepositoryError';
  }
}

export type FinishReason = 'consumed' | 'discarded';

/** Fields the user can set on an item. Status, timestamps and derived fields are managed here. */
type EditableItemFields = Pick<
  Item,
  | 'name'
  | 'location'
  | 'product_id'
  | 'category'
  | 'quantity'
  | 'unit'
  | 'expiry_date'
  | 'expiry_kind'
  | 'opened_at'
  | 'thumbnail_path'
  | 'notes'
  | 'source'
  | 'extraction_confidence'
>;

/** Req 1.1: name and location are required, the rest is optional. */
export type NewItem = Pick<EditableItemFields, 'name' | 'location'> &
  Partial<Omit<EditableItemFields, 'name' | 'location'>>;

/** A partial edit. `null` clears an optional field; `undefined` leaves it unchanged. */
export type ItemPatch = {
  [K in keyof EditableItemFields]?: undefined extends EditableItemFields[K]
    ? EditableItemFields[K] | null
    : EditableItemFields[K];
};

export type OverrideInput = Pick<UserProductOverride, 'barcode'> &
  Partial<Pick<UserProductOverride, 'name' | 'category' | 'default_location'>>;

export interface RepositoryOptions {
  ownerId: string;
  rules?: readonly ShelfLifeRule[];
  /** Current time as an ISO timestamp. Injectable for tests. */
  now?: () => string;
  newId?: () => string;
}

/** Owner id used before the user signs in (task 8 reassigns it on first sync). */
export const LOCAL_OWNER_ID = 'local';

export function createRepository(db: ShelfLifeDB, options: RepositoryOptions) {
  const ownerId = options.ownerId;
  const rules = options.rules ?? SHELF_LIFE_RULES;
  const now = options.now ?? (() => new Date().toISOString());
  const newId = options.newId ?? (() => crypto.randomUUID());

  /**
   * A timestamp strictly after the record's last one, so last-write-wins always
   * sees a later write as newer, even within one millisecond or if the clock steps back.
   */
  function stamp(previous?: string): string {
    const t = now();
    if (!previous || t > previous) return t;
    return new Date(Date.parse(previous) + 1).toISOString();
  }

  function enqueue(table: SyncedTable, recordId: string, at: string) {
    return db.outbox.put({
      key: `${table}:${recordId}`,
      table,
      record_id: recordId,
      queued_at: at,
    });
  }

  /** Validates the item, then sets its derived fields. */
  function withDerived(item: Item): Item {
    validateItem(item);
    const effective = effectiveExpiry(item, rules);
    const next = { ...item };
    if (effective) next.effective_expiry = effective;
    else delete next.effective_expiry;
    return next;
  }

  async function loadItem(id: string): Promise<Item> {
    const item = await db.items.get(id);
    if (!item || item.owner_id !== ownerId || item.deleted_at) {
      throw new RepositoryError(`Item ${id} not found`, 'not_found');
    }
    return item;
  }

  async function writeItem(id: string, change: (item: Item, at: string) => Item): Promise<Item> {
    return db.transaction('rw', db.items, db.outbox, async () => {
      const current = await loadItem(id);
      const at = stamp(current.updated_at);
      const next = withDerived({ ...change(current, at), updated_at: at });
      await db.items.put(next);
      await enqueue('items', id, at);
      return next;
    });
  }

  const items = {
    /** Req 1.1, 1.2. Without a date the item has `expiry_kind = 'none'`; with one it defaults to best before. */
    async create(input: NewItem): Promise<Item> {
      const at = stamp();
      const item = withDerived(
        stripUndefined({
          ...input,
          name: input.name?.trim(),
          id: newId(),
          owner_id: ownerId,
          created_at: at,
          updated_at: at,
          expiry_kind: input.expiry_kind ?? (input.expiry_date ? 'best_before' : 'none'),
          source: input.source ?? 'manual',
          status: 'active',
        } as Item),
      );
      await db.transaction('rw', db.items, db.outbox, async () => {
        await db.items.add(item);
        await enqueue('items', item.id, at);
      });
      return item;
    },

    /** Req 1.3. Re-derives the effective expiry. A quantity of 0 is kept; the UI asks about finishing (Req 1.5). */
    update(id: string, patch: ItemPatch): Promise<Item> {
      return writeItem(id, (item) => {
        const next = applyPatch(item, patch);
        if (typeof next.name === 'string') next.name = next.name.trim();
        return next;
      });
    },

    /** Req 1.6. Location-specific rules apply, so the effective expiry can change. */
    move(id: string, location: Location): Promise<Item> {
      return writeItem(id, (item) => ({ ...item, location }));
    },

    /** Req 1.4. Leaves active inventory but keeps the row and the reason for history. */
    async finish(id: string, reason: FinishReason): Promise<Item> {
      if (reason !== 'consumed' && reason !== 'discarded') {
        throw new RepositoryError(`Unknown finish reason "${String(reason)}"`, 'invalid');
      }
      return writeItem(id, (item, at) => ({ ...item, status: reason, finished_at: at }));
    },

    /** Soft delete, for entries added by mistake. Use `finish` for food that is used or thrown away. */
    async remove(id: string): Promise<void> {
      await writeItem(id, (item, at) => ({ ...item, deleted_at: at }));
    },

    async get(id: string): Promise<Item | undefined> {
      const item = await db.items.get(id);
      return item && item.owner_id === ownerId && !item.deleted_at ? item : undefined;
    },

    /** Active, non-deleted items, optionally for one location, oldest first. */
    async listActive(location?: Location): Promise<Item[]> {
      const rows = await db.items.where({ owner_id: ownerId, status: 'active' }).toArray();
      return rows
        .filter((i) => !i.deleted_at && (!location || i.location === location))
        .sort((a, b) => a.created_at.localeCompare(b.created_at));
    },
  };

  const settings = {
    /** The stored settings, or the defaults when none have been saved. */
    async get(): Promise<Settings> {
      const row = await db.settings.get(ownerId);
      return row ? toSettings(row) : { ...DEFAULT_SETTINGS, dietary: [] };
    },

    async update(patch: Partial<Settings>): Promise<Settings> {
      return db.transaction('rw', db.settings, db.outbox, async () => {
        const current = await db.settings.get(ownerId);
        const at = stamp(current?.updated_at);
        const next: StoredSettings = {
          ...DEFAULT_SETTINGS,
          dietary: [],
          ...current,
          ...stripUndefined(patch),
          id: ownerId,
          owner_id: ownerId,
          created_at: current?.created_at ?? at,
          updated_at: at,
        };
        validateSettings(next);
        await db.settings.put(next);
        await enqueue('settings', ownerId, at);
        return toSettings(next);
      });
    },
  };

  const overrides = {
    async get(barcode: string): Promise<UserProductOverride | undefined> {
      const row = await db.overrides.get({ owner_id: ownerId, barcode });
      return row && !row.deleted_at ? row : undefined;
    },

    /** Upsert the user's correction for a barcode (Req 9.3). */
    async save(input: OverrideInput): Promise<UserProductOverride> {
      if (!input.barcode?.trim()) throw new RepositoryError('Barcode is required', 'invalid');
      if (input.default_location && !LOCATIONS.includes(input.default_location)) {
        throw new RepositoryError(`Unknown location "${input.default_location}"`, 'invalid');
      }
      const barcode = input.barcode.trim();
      return db.transaction('rw', db.overrides, db.outbox, async () => {
        const current = await db.overrides.get({ owner_id: ownerId, barcode });
        const at = stamp(current?.updated_at);
        const next: UserProductOverride = stripUndefined({
          ...input,
          barcode,
          id: current?.id ?? newId(),
          owner_id: ownerId,
          created_at: current?.created_at ?? at,
          updated_at: at,
        });
        await db.overrides.put(next);
        await enqueue('overrides', next.id, at);
        return next;
      });
    },
  };

  /** Local cache of the shared barcode table. Server-owned, so it is not queued for sync. */
  const products = {
    get(barcode: string): Promise<Product | undefined> {
      return db.products.get(barcode);
    },
    async cache(product: Product): Promise<void> {
      await db.products.put(product);
    },
  };

  /** For the sync engine (task 9). */
  const outbox = {
    pending(): Promise<OutboxEntry[]> {
      return db.outbox.orderBy('queued_at').toArray();
    },
    /** Drops pushed entries, unless the record was written again since they were read. */
    async ack(entries: readonly OutboxEntry[]): Promise<void> {
      await db.transaction('rw', db.outbox, async () => {
        for (const entry of entries) {
          const current = await db.outbox.get(entry.key);
          if (current?.queued_at === entry.queued_at) await db.outbox.delete(entry.key);
        }
      });
    },
  };

  return { ownerId, items, settings, overrides, products, outbox };
}

export type Repository = ReturnType<typeof createRepository>;

function stripUndefined<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as T;
}

function applyPatch(item: Item, patch: ItemPatch): Item {
  const next: Record<string, unknown> = { ...item };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    if (value === null) delete next[key];
    else next[key] = value;
  }
  return next as unknown as Item;
}

function toSettings(row: StoredSettings): Settings {
  const { expiring_soon_days, digest_time, notifications_enabled, dietary, keep_photos } = row;
  return {
    expiring_soon_days,
    digest_time,
    notifications_enabled,
    dietary: [...dietary],
    keep_photos,
  };
}

function validateItem(item: Item): void {
  const fail = (message: string) => {
    throw new RepositoryError(message, 'invalid');
  };
  if (typeof item.name !== 'string' || item.name.length === 0) fail('Name is required');
  if (!LOCATIONS.includes(item.location)) fail(`Unknown location "${item.location}"`);
  if (!EXPIRY_KINDS.includes(item.expiry_kind)) fail(`Unknown expiry kind "${item.expiry_kind}"`);
  if (item.quantity !== undefined && (!Number.isFinite(item.quantity) || item.quantity < 0)) {
    fail('Quantity must be zero or more');
  }
  for (const field of ['expiry_date', 'opened_at'] as const) {
    const value = item[field];
    if (value !== undefined && !isIsoDate(value)) fail(`${field} must be an ISO date (YYYY-MM-DD)`);
  }
}

function validateSettings(settings: Settings): void {
  const days = settings.expiring_soon_days;
  if (!Number.isInteger(days) || days < 0) {
    throw new RepositoryError('Expiring-soon days must be a whole number, 0 or more', 'invalid');
  }
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(settings.digest_time)) {
    throw new RepositoryError('Digest time must be HH:MM', 'invalid');
  }
}
