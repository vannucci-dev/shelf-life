# Shelf Life

Track what's in your fridge, freezer, pantry and spice rack. Add items from a photo or a barcode, get reminded before things expire, and get recipe ideas that use them up.

> **Status:** specification phase. No app code yet.

## Planned features

- **Inventory**: items across Fridge, Freezer, Pantry and Spice rack, with quantities, opened dates and notes.
- **Photo capture**: snap one or more products and the name, location and printed expiry date are filled in for you to confirm.
- **Barcode scanning**: scan to fill in product details from Open Food Facts. Products you've scanned before work offline.
- **Expiry tracking**: Fresh, Expiring soon and Expired statuses, a "Use soon" view, and shelf-life estimates for items with no printed date.
- **Daily digest**: one push notification a day listing what's about to expire, with a recipe idea.
- **Recipes**: suggestions built from what you have, with items close to expiry used first.
- **Offline-first**: browse, search and edit with no connection, and sync when you're back online.

## Planned stack

- React + TypeScript + Vite, installable as a PWA
- IndexedDB (Dexie) for local-first storage
- Supabase for auth, Postgres, edge functions and cron
- Claude API for photo extraction and recipe suggestions
- Open Food Facts for barcode lookup

## Specs

This project uses a lightweight spec-driven workflow:

| File | Purpose |
|------|---------|
| [`specs/pantry-tracker/requirements.md`](specs/pantry-tracker/requirements.md) | User stories with EARS-style acceptance criteria |
| [`specs/pantry-tracker/design.md`](specs/pantry-tracker/design.md) | Architecture, data model and key flows |
| [`specs/pantry-tracker/tasks.md`](specs/pantry-tracker/tasks.md) | Ordered implementation tasks by milestone |
| [`docs/adr/`](docs/adr/) | Architecture Decision Records for the big choices |
