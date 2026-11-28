/**
 * Domain types from design.md §3. Pure data, no storage concerns.
 * Dates are plain ISO calendar dates ("2026-12-04"); timestamps are full ISO strings.
 */

export const LOCATIONS = ['fridge', 'freezer', 'pantry', 'spice_rack'] as const;
export type Location = (typeof LOCATIONS)[number];

export const EXPIRY_KINDS = ['use_by', 'best_before', 'estimated', 'none'] as const;
export type ExpiryKind = (typeof EXPIRY_KINDS)[number];

export type ItemSource = 'manual' | 'photo' | 'barcode';
export type ItemStatus = 'active' | 'consumed' | 'discarded';

/** Fields every synced record carries (design §3, ADR-0002). */
export interface SyncedRecord {
  id: string; // UUID, generated on device
  owner_id: string; // user id in v1, household id later
  created_at: string;
  updated_at: string;
  deleted_at?: string; // soft delete for sync
}

export interface Item extends SyncedRecord {
  name: string;
  product_id?: string;
  category?: string; // matches ShelfLifeRule.category, e.g. "dairy_milk"
  location: Location;
  quantity?: number;
  unit?: string;
  expiry_date?: string; // ISO date, printed or estimated
  expiry_kind: ExpiryKind;
  opened_at?: string; // ISO date
  effective_expiry?: string; // derived, see effectiveExpiry()
  thumbnail_path?: string;
  notes?: string;
  source: ItemSource;
  extraction_confidence?: Record<string, number>;
  status: ItemStatus;
  finished_at?: string;
}

export interface ShelfLifeRule {
  category: string;
  location: Location;
  days_unopened?: number;
  days_after_opening?: number;
}

export interface Settings {
  expiring_soon_days: number;
  digest_time: string; // "18:00", user's local time
  notifications_enabled: boolean;
  dietary: string[];
  keep_photos: boolean;
}

export const DEFAULT_SETTINGS: Readonly<Settings> = Object.freeze({
  expiring_soon_days: 3, // Req 3.1
  digest_time: '18:00',
  notifications_enabled: false,
  dietary: [],
  keep_photos: false, // Req 8.2
});

/** Barcode cache entry, shared across users and read-only to clients (design §3, Req 9). */
export interface Product {
  barcode: string; // EAN/UPC, primary key
  name: string;
  brand?: string;
  quantity_text?: string; // "500 g"
  category?: string;
  source: 'open_food_facts' | 'user';
  fetched_at: string;
}

/** The user's own correction for a barcode (Req 9.3). Synced, so it carries the record fields. */
export interface UserProductOverride extends SyncedRecord {
  barcode: string;
  name?: string;
  category?: string;
  default_location?: Location;
}
