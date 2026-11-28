import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ShelfLifeRule } from '../domain';
import { ShelfLifeDB } from './schema';
import { createRepository, RepositoryError, type Repository } from './repository';

const RULES: ShelfLifeRule[] = [
  { category: 'dairy_milk', location: 'fridge', days_unopened: 7, days_after_opening: 3 },
  { category: 'dairy_milk', location: 'freezer', days_unopened: 90, days_after_opening: 30 },
];

let db: ShelfLifeDB;
let repo: Repository;
let clock: string;
let ids: number;

function makeRepo(ownerId = 'user-1') {
  return createRepository(db, {
    ownerId,
    rules: RULES,
    now: () => clock,
    newId: () => `id-${++ids}`,
  });
}

beforeEach(async () => {
  db = new ShelfLifeDB(`test-${crypto.randomUUID()}`);
  clock = '2026-12-01T10:00:00.000Z';
  ids = 0;
  repo = makeRepo();
});

afterEach(async () => {
  await db.delete();
});

async function outboxKeys() {
  return (await repo.outbox.pending()).map((e) => e.key);
}

describe('items.create', () => {
  it('stores an active item with timestamps and queues it (Req 1.1, 1.2, 7.1)', async () => {
    const item = await repo.items.create({ name: '  Milk ', location: 'fridge' });

    expect(item).toMatchObject({
      id: 'id-1',
      owner_id: 'user-1',
      name: 'Milk',
      location: 'fridge',
      status: 'active',
      source: 'manual',
      expiry_kind: 'none',
      created_at: clock,
      updated_at: clock,
    });
    expect(item.deleted_at).toBeUndefined();
    expect(await db.items.get('id-1')).toEqual(item);
    expect(await outboxKeys()).toEqual(['items:id-1']);
  });

  it('accepts the optional fields and derives the effective expiry', async () => {
    const item = await repo.items.create({
      name: 'Milk',
      location: 'fridge',
      category: 'dairy_milk',
      quantity: 2,
      unit: 'L',
      expiry_date: '2026-12-10',
      opened_at: '2026-12-01',
      notes: 'semi-skimmed',
    });

    expect(item.expiry_kind).toBe('best_before');
    // Opened on 1 Dec with a 3-day rule beats the printed 10 Dec.
    expect(item.effective_expiry).toBe('2026-12-04');
  });

  it.each([
    [{ name: '', location: 'fridge' }, /Name/],
    [{ name: '   ', location: 'fridge' }, /Name/],
    [{ name: 'Milk', location: 'garage' }, /location/],
    [{ name: 'Milk', location: 'fridge', quantity: -1 }, /Quantity/],
    [{ name: 'Milk', location: 'fridge', expiry_date: '10/12/2026' }, /expiry_date/],
    [{ name: 'Milk', location: 'fridge', opened_at: '2026-02-30' }, /opened_at/],
  ])('rejects invalid input %j', async (input, message) => {
    // @ts-expect-error deliberately invalid input
    await expect(repo.items.create(input)).rejects.toThrow(message);
    expect(await db.items.count()).toBe(0);
    expect(await db.outbox.count()).toBe(0);
  });
});

describe('items.update', () => {
  it('persists the change, bumps updated_at and re-derives expiry (Req 1.3)', async () => {
    const created = await repo.items.create({
      name: 'Milk',
      location: 'fridge',
      category: 'dairy_milk',
      expiry_date: '2026-12-10',
    });
    clock = '2026-12-02T09:00:00.000Z';

    const updated = await repo.items.update(created.id, { opened_at: '2026-12-02', quantity: 1 });

    expect(updated).toMatchObject({ quantity: 1, effective_expiry: '2026-12-05' });
    expect(updated.created_at).toBe(created.created_at);
    expect(updated.updated_at).toBe(clock);
    expect(await db.items.get(created.id)).toEqual(updated);
  });

  it('clears optional fields with null and leaves undefined ones alone', async () => {
    const created = await repo.items.create({
      name: 'Milk',
      location: 'fridge',
      expiry_date: '2026-12-10',
      notes: 'note',
    });

    const updated = await repo.items.update(created.id, {
      expiry_date: null,
      expiry_kind: 'none',
      notes: undefined,
    });

    expect(updated.expiry_date).toBeUndefined();
    expect(updated.effective_expiry).toBeUndefined();
    expect(updated.notes).toBe('note');
  });

  it('keeps a quantity of zero so the UI can ask about finishing (Req 1.5)', async () => {
    const created = await repo.items.create({ name: 'Eggs', location: 'fridge', quantity: 1 });
    const updated = await repo.items.update(created.id, { quantity: 0 });
    expect(updated).toMatchObject({ quantity: 0, status: 'active' });
  });

  it('rejects an invalid edit without writing', async () => {
    const created = await repo.items.create({ name: 'Milk', location: 'fridge' });
    await expect(repo.items.update(created.id, { name: ' ' })).rejects.toThrow(RepositoryError);
    expect(await db.items.get(created.id)).toEqual(created);
  });

  it('makes updated_at strictly increase even when the clock does not move', async () => {
    const created = await repo.items.create({ name: 'Milk', location: 'fridge' });
    const a = await repo.items.update(created.id, { quantity: 1 });
    clock = '2026-11-30T00:00:00.000Z'; // clock stepped back
    const b = await repo.items.update(created.id, { quantity: 2 });

    expect(a.updated_at > created.updated_at).toBe(true);
    expect(b.updated_at > a.updated_at).toBe(true);
  });

  it('throws not_found for a missing item', async () => {
    await expect(repo.items.update('nope', { quantity: 1 })).rejects.toMatchObject({
      code: 'not_found',
    });
  });
});

describe('items.move', () => {
  it('changes location and applies that location’s rules (Req 1.6)', async () => {
    const created = await repo.items.create({
      name: 'Milk',
      location: 'fridge',
      category: 'dairy_milk',
      opened_at: '2026-12-01',
      expiry_kind: 'best_before',
    });
    expect(created.effective_expiry).toBe('2026-12-04');

    const moved = await repo.items.move(created.id, 'freezer');

    expect(moved).toMatchObject({ id: created.id, location: 'freezer', name: 'Milk' });
    expect(moved.effective_expiry).toBe('2026-12-31');
    expect(await repo.items.listActive('fridge')).toEqual([]);
    expect(await repo.items.listActive('freezer')).toEqual([moved]);
  });

  it('rejects an unknown location', async () => {
    const created = await repo.items.create({ name: 'Milk', location: 'fridge' });
    // @ts-expect-error deliberately invalid
    await expect(repo.items.move(created.id, 'garage')).rejects.toThrow(/location/);
  });
});

describe('items.finish', () => {
  it.each(['consumed', 'discarded'] as const)(
    'records %s and drops the item from active inventory (Req 1.4)',
    async (reason) => {
      const created = await repo.items.create({ name: 'Milk', location: 'fridge' });
      clock = '2026-12-03T18:00:00.000Z';

      const finished = await repo.items.finish(created.id, reason);

      expect(finished).toMatchObject({ status: reason, finished_at: clock, updated_at: clock });
      expect(finished.deleted_at).toBeUndefined();
      expect(await repo.items.listActive()).toEqual([]);
      expect(await repo.items.get(created.id)).toEqual(finished);
    },
  );

  it('rejects an unknown reason', async () => {
    const created = await repo.items.create({ name: 'Milk', location: 'fridge' });
    // @ts-expect-error deliberately invalid
    await expect(repo.items.finish(created.id, 'lost')).rejects.toThrow(RepositoryError);
  });
});

describe('items.remove', () => {
  it('soft-deletes so the deletion can sync', async () => {
    const created = await repo.items.create({ name: 'Typo', location: 'pantry' });
    clock = '2026-12-01T10:05:00.000Z';

    await repo.items.remove(created.id);

    expect(await repo.items.get(created.id)).toBeUndefined();
    expect(await repo.items.listActive()).toEqual([]);
    expect(await db.items.get(created.id)).toMatchObject({ deleted_at: clock, updated_at: clock });
    expect(await outboxKeys()).toEqual([`items:${created.id}`]);
  });
});

describe('items.listActive', () => {
  it('lists only the owner’s active items, by location, oldest first', async () => {
    const a = await repo.items.create({ name: 'A', location: 'pantry' });
    clock = '2026-12-01T11:00:00.000Z';
    const b = await repo.items.create({ name: 'B', location: 'fridge' });
    clock = '2026-12-01T12:00:00.000Z';
    const c = await repo.items.create({ name: 'C', location: 'pantry' });
    await repo.items.finish(b.id, 'consumed');
    await makeRepo('someone-else').items.create({ name: 'X', location: 'pantry' });

    expect((await repo.items.listActive()).map((i) => i.name)).toEqual(['A', 'C']);
    expect((await repo.items.listActive('pantry')).map((i) => i.id)).toEqual([a.id, c.id]);
    expect(await repo.items.listActive('fridge')).toEqual([]);
  });

  it('cannot read or change another owner’s items', async () => {
    const mine = await repo.items.create({ name: 'Mine', location: 'fridge' });
    const other = makeRepo('someone-else');
    expect(await other.items.get(mine.id)).toBeUndefined();
    await expect(other.items.update(mine.id, { name: 'Theirs' })).rejects.toMatchObject({
      code: 'not_found',
    });
  });
});

describe('settings', () => {
  it('returns defaults before anything is saved, without writing', async () => {
    expect(await repo.settings.get()).toEqual({
      expiring_soon_days: 3,
      digest_time: '18:00',
      notifications_enabled: false,
      dietary: [],
      keep_photos: false,
    });
    expect(await db.settings.count()).toBe(0);
  });

  it('saves a patch as one synced row per owner', async () => {
    await repo.settings.update({ expiring_soon_days: 5 });
    clock = '2026-12-02T10:00:00.000Z';
    const saved = await repo.settings.update({ dietary: ['vegetarian'] });

    expect(saved).toMatchObject({ expiring_soon_days: 5, dietary: ['vegetarian'] });
    expect(await db.settings.get('user-1')).toMatchObject({
      owner_id: 'user-1',
      created_at: '2026-12-01T10:00:00.000Z',
      updated_at: clock,
    });
    expect(await outboxKeys()).toEqual(['settings:user-1']);
  });

  it('rejects invalid values', async () => {
    await expect(repo.settings.update({ expiring_soon_days: -1 })).rejects.toThrow(RepositoryError);
    await expect(repo.settings.update({ digest_time: '25:00' })).rejects.toThrow(RepositoryError);
    expect(await db.settings.count()).toBe(0);
  });
});

describe('overrides and products', () => {
  it('upserts one override per owner and barcode (Req 9.3)', async () => {
    const first = await repo.overrides.save({ barcode: '5000112637922', name: 'Cola' });
    clock = '2026-12-02T10:00:00.000Z';
    const second = await repo.overrides.save({
      barcode: '5000112637922',
      name: 'Diet cola',
      default_location: 'pantry',
    });

    expect(second).toMatchObject({ id: first.id, created_at: first.created_at, updated_at: clock });
    expect(await repo.overrides.get('5000112637922')).toEqual(second);
    expect(await db.overrides.count()).toBe(1);
    expect(await outboxKeys()).toEqual([`overrides:${first.id}`]);
  });

  it('caches products locally without queueing them for sync', async () => {
    const product = {
      barcode: '123',
      name: 'Beans',
      source: 'open_food_facts' as const,
      fetched_at: clock,
    };
    await repo.products.cache(product);
    expect(await repo.products.get('123')).toEqual(product);
    expect(await db.outbox.count()).toBe(0);
  });
});

describe('outbox', () => {
  it('collapses repeated writes to one entry per record, in queue order', async () => {
    const a = await repo.items.create({ name: 'A', location: 'fridge' });
    clock = '2026-12-01T10:01:00.000Z';
    const b = await repo.items.create({ name: 'B', location: 'fridge' });
    clock = '2026-12-01T10:02:00.000Z';
    await repo.items.update(a.id, { quantity: 3 });

    expect(await outboxKeys()).toEqual([`items:${b.id}`, `items:${a.id}`]);
  });

  it('ack keeps an entry that was re-queued after it was read', async () => {
    const a = await repo.items.create({ name: 'A', location: 'fridge' });
    const b = await repo.items.create({ name: 'B', location: 'fridge' });
    const pushed = await repo.outbox.pending();
    clock = '2026-12-01T10:03:00.000Z';
    await repo.items.update(a.id, { quantity: 1 }); // written during the push

    await repo.outbox.ack(pushed);

    expect(await outboxKeys()).toEqual([`items:${a.id}`]);
    expect(b.id).toBeDefined();
  });
});

describe('persistence', () => {
  it('survives reopening the database (Req 7.1)', async () => {
    const created = await repo.items.create({ name: 'Rice', location: 'pantry' });
    const name = db.name;
    db.close();

    db = new ShelfLifeDB(name);
    repo = makeRepo();
    expect(await repo.items.get(created.id)).toEqual(created);
  });
});
