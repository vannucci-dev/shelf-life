import { describe, expect, it } from 'vitest';
import type { Item, ShelfLifeRule } from '../domain';
import { describeExpiry } from './describeExpiry';

const TODAY = '2026-12-01';
const RULES: ShelfLifeRule[] = [
  { category: 'dairy_milk', location: 'fridge', days_unopened: 7, days_after_opening: 3 },
];

type Fields = Parameters<typeof describeExpiry>[0];
const base: Fields = { location: 'fridge', expiry_kind: 'best_before' };
const describe_ = (item: Partial<Item>) =>
  describeExpiry({ ...base, ...item } as Fields, TODAY, 3, RULES);

describe('describeExpiry', () => {
  it('shows nothing for items with no expiry, such as spices (Req 3.5)', () => {
    expect(describe_({ expiry_kind: 'none' })).toEqual({ status: null, badge: null, date: null });
  });

  it('shows only the date for fresh items', () => {
    expect(describe_({ expiry_date: '2026-12-20' })).toEqual({
      status: 'fresh',
      badge: null,
      date: 'Best before 20 Dec',
    });
  });

  it('flags items due within the expiring-soon window, today included', () => {
    expect(describe_({ expiry_date: '2026-12-04', expiry_kind: 'use_by' })).toMatchObject({
      status: 'expiring_soon',
      badge: 'Use soon',
      date: 'Use by 4 Dec',
    });
    expect(describe_({ expiry_date: TODAY }).status).toBe('expiring_soon');
  });

  it('tells a past use-by apart from a past best-before (Req 3.4)', () => {
    expect(describe_({ expiry_date: '2026-11-30', expiry_kind: 'use_by' }).badge).toBe('Expired');
    expect(describe_({ expiry_date: '2026-11-30', expiry_kind: 'best_before' }).badge).toBe(
      'Past best before',
    );
  });

  it('marks estimated dates with "~" (Req 4.2)', () => {
    expect(describe_({ expiry_date: '2026-12-10', expiry_kind: 'estimated' }).date).toBe(
      'Good until ~ 10 Dec',
    );
  });

  it('uses the opened-at rule when it is earlier, as an estimate (Req 3.3)', () => {
    const result = describe_({
      category: 'dairy_milk',
      expiry_date: '2026-12-20',
      expiry_kind: 'use_by',
      opened_at: '2026-11-30',
    });
    expect(result).toMatchObject({ status: 'expiring_soon', date: 'Opened, use by ~ 3 Dec' });
  });

  it('shows the year for dates in another year', () => {
    expect(describe_({ expiry_date: '2027-02-01' }).date).toBe('Best before 1 Feb 2027');
  });
});
