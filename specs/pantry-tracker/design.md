# Design: Pantry Tracker

> Status: **Draft v0.1** (2026-11-26). Implements [requirements.md](requirements.md) v0.2. Big decisions are recorded as ADRs in [`docs/adr/`](../../docs/adr/).

## 1. Overview

A mobile-first **Progressive Web App** (installable from the browser on iOS and Android) that keeps the inventory **locally first** in the browser and syncs it to a small hosted backend. Three features need a server: **photo extraction** and **recipe suggestions** use the Claude API, and **barcode lookups** use Open Food Facts. The server keeps the API key secret and sends the daily push digest.

```
┌──────────────────────── Phone (PWA) ────────────────────────┐
│ UI (React)                                                   │
│  ├─ Inventory / Use soon / Search / Recipes / Capture        │
│  ├─ Camera + barcode scanner (on-device)                     │
│  └─ Local store (IndexedDB via Dexie)  ◄── works offline     │
│         ▲  sync queue (outbox)                               │
└─────────┼────────────────────────────────────────────────────┘
          │ HTTPS
┌─────────▼──────────── Backend (Supabase) ───────────────────┐
│ Auth · Postgres (items, products, recipes) · Row-level sec.  │
│ Edge functions:                                              │
│   /extract   → Claude vision  (photo → draft items)          │
│   /barcode   → Open Food Facts lookup + cache                │
│   /recipes   → Claude (inventory → ranked recipes)           │
│   cron daily → expiry digest → Web Push                      │
└──────────────────────────────────────────────────────────────┘
```

## 2. Tech stack

| Layer | Choice | Why |
|-------|--------|-----|
| Frontend | React + TypeScript + Vite, `vite-plugin-pwa` | One codebase, installable, service worker for offline. ([ADR-0001](../../docs/adr/0001-pwa-first.md)) |
| Local data | IndexedDB via Dexie | Fast offline reads/writes, simple querying. ([ADR-0002](../../docs/adr/0002-local-first-sync-with-supabase.md)) |
| Backend | Supabase (Postgres, Auth, Storage, Edge Functions, cron) | Hosted, cheap at personal scale, row-level security. Swappable later. |
| Photo extraction | Claude vision via `/extract` | Best accuracy on product names and printed dates. ([ADR-0003](../../docs/adr/0003-claude-vision-for-extraction.md)) |
| Barcode scan | `BarcodeDetector` API where available, `zxing-wasm` fallback | On-device, works offline. |
| Barcode lookup | Open Food Facts API, cached in our `products` table | Free, open, good EU/UK coverage. ([ADR-0004](../../docs/adr/0004-barcode-lookup-open-food-facts.md)) |
| Recipes | Claude via `/recipes`, structured JSON output | Works directly from the inventory, honours filters. ([ADR-0005](../../docs/adr/0005-recipes-generated-by-claude.md)) |
| Notifications | Web Push (VAPID) | Supported on Android and on iOS 16.4+ for installed PWAs. |

## 3. Data model

All records have `id` (UUID, generated on device), `created_at`, `updated_at`, `deleted_at` (soft delete for sync), and `owner_id`. `owner_id` is a user id in v1. Making it a `household_id` later is the only change needed for shared inventories.

```ts
type Location = 'fridge' | 'freezer' | 'pantry' | 'spice_rack';
type ExpiryKind = 'use_by' | 'best_before' | 'estimated' | 'none';

interface Item {
  id: string;
  name: string;                 // "Semi-skimmed milk"
  product_id?: string;          // link to Product when from barcode
  category?: string;            // "dairy", "fresh_herbs", "spice", ...
  location: Location;
  quantity?: number;
  unit?: string;                // "L", "g", "pcs", "jar"
  expiry_date?: string;         // ISO date, printed or estimated
  expiry_kind: ExpiryKind;
  opened_at?: string;
  effective_expiry?: string;    // derived: min(expiry_date, opened_at + rule)
  thumbnail_path?: string;      // optional, small image only
  notes?: string;
  source: 'manual' | 'photo' | 'barcode';
  extraction_confidence?: Record<string, number>; // per field, 0..1
  status: 'active' | 'consumed' | 'discarded';
  finished_at?: string;
}

interface Product {             // barcode cache, shared across users
  barcode: string;              // EAN/UPC, primary key
  name: string; brand?: string;
  quantity_text?: string;       // "500 g"
  category?: string;
  source: 'open_food_facts' | 'user';
  fetched_at: string;
}

interface UserProductOverride { // user's own corrections for a barcode (Req 9.3)
  owner_id: string; barcode: string;
  name?: string; category?: string; default_location?: Location;
}

interface ShelfLifeRule {       // seed data, Req 3.3 and 4
  category: string; location: Location;
  days_unopened?: number; days_after_opening?: number;
}

interface SavedRecipe {
  id: string; title: string;
  ingredients: { name: string; quantity?: string }[];
  steps: string[]; minutes?: number; tags: string[];
  source: 'ai_generated' | 'url'; source_url?: string;
}

interface Settings {
  expiring_soon_days: number;   // default 3
  digest_time: string;          // "18:00", user's local time
  notifications_enabled: boolean;
  dietary: string[];            // "vegetarian", ...
  keep_photos: boolean;         // default false (Req 8.2)
}
```

**Expiry status** is computed on read, not stored: `expired` if `effective_expiry < today`, `expiring_soon` if within `expiring_soon_days`, otherwise `fresh`. Items with `expiry_kind = 'none'` have no status (Req 3.5).

## 4. Key flows

### 4.1 Photo capture (Req 2)
1. The user takes or picks a photo. The client resizes it to about 1568 px on the long edge as JPEG, to keep it fast and cheap.
2. `POST /extract` with the image. The function calls Claude vision with a prompt that asks for a **strict JSON** list:
   `[{ name, brand?, category, quantity?, unit?, expiry_date?, expiry_kind, suggested_location, confidence: {name, expiry_date} }]`
   The prompt handles common UK/EU date formats ("BB 03/25", "USE BY 12 DEC", day-first numerics). It returns `null` rather than guessing.
3. The client validates the JSON (zod). When `expiry_date` is missing, it applies a `ShelfLifeRule` estimate and sets `expiry_kind = 'estimated'`.
4. A draft review screen shows each item. Fields with confidence below 0.7 are highlighted. The user edits, then confirms all of them (Req 2.7).
5. The photo is discarded after extraction unless `keep_photos` is on. An optional thumbnail of about 200 px can be kept.

Failure or timeout (10 s budget) falls back to the manual form, with the photo still visible (Req 2.5).

### 4.2 Barcode scan (Req 9)
1. The scanner runs continuously on-device. Each detected code is added to a batch tray (Req 9.6).
2. Lookup order: the local Dexie cache, then `UserProductOverride`, then `GET /barcode/:code`. The server checks the `products` table first, then calls Open Food Facts and caches the result.
3. If a code is not found, the app offers a photo of the front label (reusing `/extract`) or manual entry. The result is saved as a `UserProductOverride` (Req 9.3).
4. If the barcode matches an active item, the user chooses between "+1 quantity" and "new entry with its own date" (Req 9.4).
5. Expiry prompt: "Snap the date" (a targeted `/extract` call that reads only the date), "Estimate" or "Skip".

### 4.3 Recipe suggestions (Req 10)
1. The client sends a compact inventory to `POST /recipes`: name, category, quantity, location and days-to-expiry for active items, plus the filters and dietary settings.
2. Claude returns structured JSON with 5 recipes. Each has `uses_items[]` (inventory ids), `missing[]`, `minutes`, `steps[]` and `uses_expiring_count`.
3. The server re-ranks them: expiring items used first, then fewest missing ingredients, then time. Staples (salt, pepper, oil, water) are always treated as available (Req 10.5).
4. "Cooked it" opens a checklist of `uses_items` with suggested quantity decreases (Req 10.6).
5. All results are labelled "AI-generated" (Req 10.9). Recipes from a URL are a later extension.

### 4.4 Daily digest (Req 5)
A cron job runs every 15 minutes and selects users whose `digest_time` falls in that window. It computes items in the expiring soon or expired state and, if there are any, sends one Web Push. The digest can include one recipe idea taken from a cached `/recipes` call (Req 10.8). Tapping the notification opens `/use-soon`.

## 5. Offline and sync (Req 7)

- **Local-first**: the UI reads and writes only Dexie. Each write is also added to an `outbox`.
- **Sync loop**: whenever the app is online (on start, on focus, and every 60 s), it pushes the outbox and then pulls rows with `updated_at > last_pulled_at`.
- **Conflicts**: last-write-wins per record using `updated_at`. This is acceptable for one user on a few devices. A household version will need per-field merges ([ADR-0002](../../docs/adr/0002-local-first-sync-with-supabase.md)).
- **Offline features**: browse, search, add, edit, and scanning known barcodes. Capture, new barcode lookups and recipes are queued or disabled, with a clear "needs connection" message.
- **Export**: CSV and JSON are generated client-side from Dexie (Req 7.4).

## 6. Search (Req 6)
A client-side search over Dexie, using a normalised lowercase name plus a prefix/trigram match (e.g. MiniSearch). It is instant and works offline. Filters (location, status) and sorting (name, expiry, added) run over the same index.

## 7. Security and privacy (Req 8)
- The Claude API key exists only in Edge Function secrets and never reaches the client.
- Postgres row-level security uses `owner_id = auth.uid()` on every user table. The `products` cache is shared and read-only to clients.
- Images are sent to `/extract` and are not stored by us unless `keep_photos` is on. Under Anthropic's API terms, inputs are not used for training by default.
- Account deletion cascades to items, overrides, saved recipes and storage objects (Req 8.3).
- Each user has a rate limit on `/extract` and `/recipes` to cap API spend.

## 8. Cost estimate (personal use)
Roughly 5 to 10 photo extractions and 2 to 5 recipe calls a week fit comfortably on the Supabase free tier, with Claude API costs of a few pence to low pounds a month. The model ID is a config value, so it can be swapped for a cheaper model if that's accurate enough.

## 9. Testing strategy
- **Unit tests**: expiry status and effective-expiry maths, shelf-life estimates, ranking, and the date parsing helpers.
- **Extraction eval set**: about 30 real photos from the fridge, pantry and spice rack, with expected JSON. Measure name and date accuracy whenever the prompt or model changes.
- **E2E tests**: Playwright on a mobile viewport covering add manually, scan a barcode (with a mocked camera), the offline edit-then-sync flow, and the recipe "cooked it" flow.

## 10. Out of scope / later
Households and sharing, receipt capture, custom locations, recipe import from URL, a shopping list generated from recipe gaps, and native app wrappers (Capacitor) if PWA limits start to hurt.
