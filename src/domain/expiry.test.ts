import { describe, expect, it } from 'vitest';
import { effectiveExpiry, estimateExpiry, expiryStatus, findRule, resolveExpiry } from './expiry';
import type { ShelfLifeRule } from './types';

const rules: ShelfLifeRule[] = [
  { category: 'milk', location: 'fridge', days_unopened: 7, days_after_opening: 3 },
  { category: 'pesto', location: 'fridge', days_after_opening: 5 },
  { category: 'bread', location: 'freezer', days_unopened: 90 },
];

describe('findRule', () => {
  it('matches category and location, ignoring case and spaces', () => {
    expect(findRule(rules, ' Milk ', 'fridge')?.days_after_opening).toBe(3);
  });

  it('does not fall back to another location', () => {
    expect(findRule(rules, 'bread', 'pantry')).toBeUndefined();
    expect(findRule(rules, undefined, 'fridge')).toBeUndefined();
  });
});

describe('estimateExpiry', () => {
  it('adds the unopened shelf life to the start date', () => {
    expect(estimateExpiry(rules, 'bread', 'freezer', '2026-11-28T10:00:00Z')).toBe('2027-02-26');
  });

  it('returns undefined when there is no unopened rule', () => {
    expect(estimateExpiry(rules, 'pesto', 'fridge', '2026-11-28')).toBeUndefined();
    expect(estimateExpiry(rules, 'caviar', 'fridge', '2026-11-28')).toBeUndefined();
  });
});

describe('effectiveExpiry', () => {
  const milk = { category: 'milk', location: 'fridge' as const };

  it('uses the printed date for an unopened item', () => {
    const item = { ...milk, expiry_kind: 'use_by' as const, expiry_date: '2026-12-05' };
    expect(effectiveExpiry(item, rules)).toBe('2026-12-05');
    expect(resolveExpiry(item, rules)).toEqual({
      date: '2026-12-05',
      estimated: false,
      basis: 'printed',
    });
  });

  it('uses the opened rule when it is earlier than the printed date (Req 3.3)', () => {
    const item = {
      ...milk,
      expiry_kind: 'use_by' as const,
      expiry_date: '2026-12-05',
      opened_at: '2026-11-28T08:00:00Z',
    };
    expect(resolveExpiry(item, rules)).toEqual({
      date: '2026-12-01',
      estimated: true,
      basis: 'opened',
    });
  });

  it('keeps the printed date when it is earlier than the opened rule', () => {
    const item = {
      ...milk,
      expiry_kind: 'use_by' as const,
      expiry_date: '2026-11-29',
      opened_at: '2026-11-28',
    };
    expect(effectiveExpiry(item, rules)).toBe('2026-11-29');
  });

  it('uses the opened rule alone when nothing is printed', () => {
    const item = {
      category: 'pesto',
      location: 'fridge' as const,
      expiry_kind: 'estimated' as const,
      opened_at: '2026-11-28',
    };
    expect(effectiveExpiry(item, rules)).toBe('2026-12-03');
  });

  it('marks estimated dates as estimated', () => {
    const item = { ...milk, expiry_kind: 'estimated' as const, expiry_date: '2026-12-05' };
    expect(resolveExpiry(item, rules)).toMatchObject({ estimated: true, basis: 'estimated' });
  });

  it('ignores opening when the category has no opened rule', () => {
    const item = {
      category: 'bread',
      location: 'freezer' as const,
      expiry_kind: 'best_before' as const,
      expiry_date: '2027-02-01',
      opened_at: '2026-11-28',
    };
    expect(effectiveExpiry(item, rules)).toBe('2027-02-01');
  });

  it('has no expiry for kind none, even when opened (Req 3.5)', () => {
    const item = {
      ...milk,
      expiry_kind: 'none' as const,
      expiry_date: '2026-12-05',
      opened_at: '2026-11-28',
    };
    expect(effectiveExpiry(item, rules)).toBeUndefined();
  });

  it('has no expiry without a date or an opened rule', () => {
    expect(effectiveExpiry({ ...milk, expiry_kind: 'best_before' }, rules)).toBeUndefined();
  });
});

describe('expiryStatus', () => {
  const today = '2026-11-28';
  const at = (date: string) => ({ expiry_kind: 'use_by' as const, effective_expiry: date });

  it.each([
    ['2026-11-27', 'expired'],
    ['2026-11-28', 'expiring_soon'],
    ['2026-12-01', 'expiring_soon'],
    ['2026-12-02', 'fresh'],
  ])('classifies %s as %s with the default 3 days', (date, status) => {
    expect(expiryStatus(at(date), today, 3)).toBe(status);
  });

  it('respects a custom expiring-soon window', () => {
    expect(expiryStatus(at('2026-12-05'), today, 7)).toBe('expiring_soon');
    expect(expiryStatus(at('2026-11-29'), today, 0)).toBe('fresh');
  });

  it('falls back to expiry_date when effective_expiry is not set', () => {
    expect(expiryStatus({ expiry_kind: 'best_before', expiry_date: '2026-11-01' }, today, 3)).toBe(
      'expired',
    );
  });

  it('prefers effective_expiry over expiry_date', () => {
    const item = {
      expiry_kind: 'use_by' as const,
      expiry_date: '2026-12-20',
      effective_expiry: '2026-11-29',
    };
    expect(expiryStatus(item, today, 3)).toBe('expiring_soon');
  });

  it('has no status for kind none or a missing date (Req 3.5)', () => {
    expect(expiryStatus({ expiry_kind: 'none', expiry_date: '2026-11-01' }, today, 3)).toBeNull();
    expect(expiryStatus({ expiry_kind: 'best_before' }, today, 3)).toBeNull();
  });
});
