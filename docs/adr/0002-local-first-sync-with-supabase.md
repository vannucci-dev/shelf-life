# 0002: Local-first storage, synced to Supabase

- Status: Accepted
- Date: 2026-11-26

## Context
The inventory must be browsable and editable offline (in a shop, or with a weak signal by the fridge). It also has to sync between devices, and the server needs data for push digests.

## Decision
The client reads and writes IndexedDB (Dexie) only, and keeps an outbox. A sync loop pushes and pulls against Supabase Postgres using `updated_at` and soft deletes. Conflicts are resolved by last write wins per record.

## Consequences
- The UI is instant and works offline.
- Last-write-wins is fine for one person on a few devices. It is not good enough for households editing at the same time, which will need per-field merges or a CRDT, decided in a later ADR.
- Supabase also gives us auth, row-level security, storage, edge functions and cron in one hosted service. Lock-in is moderate, since it's standard Postgres underneath.
