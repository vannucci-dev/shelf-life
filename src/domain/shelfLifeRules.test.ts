import { describe, expect, it } from 'vitest';
import { estimateExpiry, findRule } from './expiry';
import { SHELF_LIFE_RULES } from './shelfLifeRules';
import { LOCATIONS } from './types';

describe('seed shelf-life rules', () => {
  it('has around 40+ rules covering every location', () => {
    expect(SHELF_LIFE_RULES.length).toBeGreaterThanOrEqual(40);
    for (const location of LOCATIONS) {
      expect(SHELF_LIFE_RULES.some((r) => r.location === location)).toBe(true);
    }
  });

  it('is well formed', () => {
    const seen = new Set<string>();
    for (const rule of SHELF_LIFE_RULES) {
      const key = `${rule.category}@${rule.location}`;
      expect(seen.has(key), `duplicate ${key}`).toBe(false);
      seen.add(key);
      expect(rule.category).toMatch(/^[a-z_]+$/);
      expect(LOCATIONS).toContain(rule.location);
      expect(rule.days_unopened ?? rule.days_after_opening, key).toBeDefined();
      for (const days of [rule.days_unopened, rule.days_after_opening]) {
        if (days !== undefined) expect(Number.isInteger(days) && days > 0, key).toBe(true);
      }
      if (rule.days_unopened !== undefined && rule.days_after_opening !== undefined) {
        expect(rule.days_after_opening, key).toBeLessThanOrEqual(rule.days_unopened);
      }
    }
  });

  it.each([
    ['fresh_herbs', 'fridge'],
    ['milk', 'fridge'],
    ['raw_meat', 'fridge'],
    ['leftovers', 'fridge'],
    ['pesto', 'fridge'],
    ['ground_spices', 'spice_rack'],
  ] as const)('covers %s in the %s', (category, location) => {
    expect(findRule(SHELF_LIFE_RULES, category, location)).toBeDefined();
  });

  it('gives fresh herbs in the fridge 7 days (Req 4.1 example)', () => {
    expect(estimateExpiry(SHELF_LIFE_RULES, 'fresh_herbs', 'fridge', '2026-11-28')).toBe(
      '2026-12-05',
    );
  });
});
