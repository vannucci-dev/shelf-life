# Tasks: Pantry Tracker

> Status: **Draft v0.1** (2026-11-26). Implements [design.md](design.md) v0.1 and [requirements.md](requirements.md) v0.2.

Tasks are listed in build order. Each one should be a single small PR that leaves the app working. `_Req: n.m_` points to acceptance criteria. Tick the boxes as tasks merge.

Milestones:
- **M1, Manual inventory, offline** (tasks 1 to 7): usable day to day without any AI.
- **M2, Sync and accounts** (8 to 9)
- **M3, Fast capture** (10 to 13): barcode and photo.
- **M4, Reminders and recipes** (14 to 17)
- **M5, Polish and ship** (18 to 20)

---

## M1: Manual inventory, offline

- [x] **1. Project scaffold**
  - Vite + React + TypeScript, ESLint, Prettier, Vitest and Playwright set up, with a mobile viewport project for Playwright.
  - `vite-plugin-pwa` with a manifest (name "Shelf Life", icons, `display: standalone`) and a service worker that precaches the app shell.
  - GitHub Actions CI: lint, typecheck, unit tests, build.
  - Done when the app installs to the home screen and loads offline with an empty shell.
  - _Req: 7.2 · ADR-0001_

- [x] **2. Domain model and expiry logic (pure TS, unit-tested)**
  - The `Item`, `Location`, `ExpiryKind` and `Settings` types from design §3.
  - `effectiveExpiry(item, rules)`, `expiryStatus(item, today, soonDays)`, and a date helper for day-first UK/EU dates.
  - Seed `ShelfLifeRule` data as JSON, about 40 categories × locations, including fresh produce, dairy, meat, leftovers, opened jars and spices.
  - _Req: 3.1, 3.3, 3.5, 4.1_

- [ ] **3. Local store**
  - A Dexie schema for items, settings, products, overrides and outbox, with `updated_at` / `deleted_at` on every write.
  - A repository layer (`items.create/update/move/finish`) that is the only path to the DB.
  - _Req: 1.1–1.6, 7.1 · ADR-0002_

- [ ] **4. Inventory screens**
  - Tabs per location, item rows with expiry badges, and an add/edit form.
  - Move between locations, a quantity stepper, and the "used up?" prompt at zero.
  - A "Used / Thrown away" action that records the reason.
  - _Req: 1.1–1.6, 3.4_

- [ ] **5. Use soon view**
  - Cross-location list of expiring and expired items, sorted by effective expiry ascending.
  - Estimated dates are labelled everywhere ("~ 4 Dec").
  - _Req: 3.2, 4.2, 4.3_

- [ ] **6. Search, filter and sort**
  - MiniSearch index kept in sync with Dexie: partial and case-insensitive matching, filters by location and status, and sorting by name, expiry or date added.
  - Duplicate entries are grouped, with each one showing its own quantity and date.
  - _Req: 6.1–6.3_

- [ ] **7. Settings and export**
  - Expiring-soon days, a dietary preferences placeholder, and a keep-photos toggle.
  - CSV and JSON export generated client-side.
  - _Req: 3.1, 7.4, 8.2_

## M2: Sync and accounts

- [ ] **8. Supabase project and schema**
  - SQL migrations for `items`, `products`, `user_product_overrides`, `saved_recipes`, `settings` and `push_subscriptions`.
  - Row-level security on `owner_id = auth.uid()`. `products` is read-only to clients.
  - Auth with email magic link.
  - Account deletion that cascades through every table and storage.
  - _Req: 7.1, 8.3_

- [ ] **9. Sync engine**
  - Push the outbox, then pull with `updated_at > cursor`. Last write wins per record, and soft deletes propagate.
  - Triggers: app start, window focus, coming back online, and a 60 s interval while active.
  - Tests: two simulated devices, an offline edit that syncs later, and a conflict where the newest write wins.
  - _Req: 7.2, 7.3 · ADR-0002_

## M3: Fast capture

- [ ] **10. Barcode scanner**
  - A camera view using `BarcodeDetector`, with a `zxing-wasm` fallback (lazy-loaded).
  - Continuous scanning into a batch tray, with a haptic or beep on each detection.
  - _Req: 9.6_

- [ ] **11. Barcode lookup**
  - Edge function `GET /barcode/:code`. It checks the `products` cache, then calls Open Food Facts with a generic User-Agent and caches the result.
  - The client looks codes up in this order: Dexie, then the user's override, then the server.
  - When a code matches an existing item, offer "+1 quantity" or "new entry with its own date".
  - When a code isn't found, offer a photo of the front label or manual entry, and save the answer as an override.
  - _Req: 9.1–9.5 · ADR-0004_

- [ ] **12. Photo extraction endpoint**
  - Edge function `POST /extract`, which calls Claude vision. The model ID is set as a config value and the API key is stored as a secret.
  - The prompt returns strict JSON (design §4.1). There is also a date-only mode for the barcode flow.
  - Server-side zod validation, a 10 s timeout and a per-user rate limit.
  - An eval script that runs against `eval/photos/*.jpg` with expected JSON and reports name and date accuracy. Start with about 30 real photos.
  - _Req: 2.1, 2.3, 2.4, 2.8, 8.1 · ADR-0003_

- [ ] **13. Photo capture UI**
  - Take or pick a photo, resize it to about 1568 px, then show a draft review screen with low-confidence fields highlighted. An estimated expiry is applied when none is found, and the suggested location can be changed.
  - Confirm all drafts at once. On failure, fall back to the manual form with the photo still visible.
  - The photo is discarded after extraction unless keep-photos is on. An optional 200 px thumbnail can be kept.
  - _Req: 2.1–2.7, 8.1, 8.2_

## M4: Reminders and recipes

- [ ] **14. Web Push setup**
  - VAPID keys, a subscription stored in `push_subscriptions`, and a permission prompt shown at a sensible moment (after the first item is added, not on first launch).
  - iOS: show "Add to Home Screen" guidance when push isn't available.
  - _Req: 5.2_

- [ ] **15. Daily digest**
  - A cron job every 15 minutes picks users whose `digest_time` falls in that window and sends one push listing items that are expiring soon or expired. Nothing is sent when the list is empty.
  - Tapping the notification deep-links to `/use-soon`.
  - _Req: 5.1–5.3_

- [ ] **16. Recipe suggestions**
  - Edge function `POST /recipes`. It builds a compact inventory, calls Claude with structured JSON output, and re-ranks the results: expiring items used, then fewest missing ingredients, then cooking time. Staples count as always available.
  - The result is cached per inventory snapshot and filter set.
  - UI: recipe cards showing have / missing / expiring ingredients, filters (time, diet, only what I have), an "AI-generated" label, and save to favourites.
  - _Req: 10.1–10.5, 10.7, 10.9 · ADR-0005_

- [ ] **17. "Cooked it" and digest recipe**
  - "Cooked it" opens a checklist of the ingredients used, with suggested quantity decreases, applied through the repository layer.
  - The digest includes one cached recipe idea that uses the expiring items.
  - _Req: 10.6, 10.8_

## M5: Polish and ship

- [ ] **18. E2E suite**
  - Playwright on a mobile viewport covering manual add, barcode scan with a mocked camera, offline edit then sync, photo capture with a mocked `/extract`, and recipe "cooked it".

- [ ] **19. Accessibility and performance pass**
  - Labels, contrast, focus order and dynamic type.
  - Lighthouse PWA and performance scores of at least 90, and a lazy-loaded scanner and capture code.

- [ ] **20. Deploy**
  - Host the frontend (e.g. Vercel or Netlify) and deploy the Supabase functions from CI.
  - A production smoke test, plus a short "how to install on your phone" section in the README.

---

## Later (not v1)
Households and shared inventories (and a per-field merge ADR), receipt capture, custom locations, recipe import from URL, a shopping list from recipe gaps, and a Capacitor wrapper.
