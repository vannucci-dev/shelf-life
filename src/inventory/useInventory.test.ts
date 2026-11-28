import { describe, expect, it } from 'vitest';
import type { Item } from '../domain';
import { sortByExpiry } from './useInventory';

const item = (name: string, effective_expiry?: string) => ({ name, effective_expiry }) as Item;

describe('sortByExpiry', () => {
  it('puts the soonest date first and undated items last, by name', () => {
    const sorted = sortByExpiry([
      item('Paprika'),
      item('Milk', '2026-12-05'),
      item('Cumin'),
      item('Ham', '2026-12-02'),
    ]);
    expect(sorted.map((i) => i.name)).toEqual(['Ham', 'Milk', 'Cumin', 'Paprika']);
  });
});
