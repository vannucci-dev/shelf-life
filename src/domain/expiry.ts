import { addDays, daysBetween, toIsoDate, type IsoDate } from './dates';
import type { Item, Location, ShelfLifeRule } from './types';

export type ExpiryStatus = 'expired' | 'expiring_soon' | 'fresh';

export interface ResolvedExpiry {
  date: IsoDate;
  /** True when the date is not printed: an estimate, or an opened-at rule (Req 4.2). */
  estimated: boolean;
  basis: 'printed' | 'estimated' | 'opened';
}

function normaliseCategory(category: string): string {
  return category.trim().toLowerCase();
}

/** The rule for a category in a location. No cross-location fallback: freezer and pantry lives differ too much. */
export function findRule(
  rules: readonly ShelfLifeRule[],
  category: string | undefined,
  location: Location,
): ShelfLifeRule | undefined {
  if (!category) return undefined;
  const key = normaliseCategory(category);
  return rules.find((r) => r.location === location && r.category === key);
}

/**
 * Default expiry for an item with no printed date (Req 4.1): `from` plus the
 * rule's unopened shelf life. Callers set `expiry_kind = 'estimated'` with it.
 */
export function estimateExpiry(
  rules: readonly ShelfLifeRule[],
  category: string | undefined,
  location: Location,
  from: string,
): IsoDate | undefined {
  const days = findRule(rules, category, location)?.days_unopened;
  return days === undefined ? undefined : addDays(toIsoDate(from), days);
}

/**
 * The date an item should be used by, and whether it is estimated.
 *
 * It is the earlier of the stored expiry date and, for an opened item whose
 * category has a "use within N days of opening" rule, `opened_at + N` (Req 3.3).
 * Items marked `none` (e.g. spices, Req 3.5) have no expiry.
 */
export function resolveExpiry(
  item: Pick<Item, 'expiry_date' | 'expiry_kind' | 'opened_at' | 'category' | 'location'>,
  rules: readonly ShelfLifeRule[],
): ResolvedExpiry | undefined {
  if (item.expiry_kind === 'none') return undefined;

  let best: ResolvedExpiry | undefined;
  if (item.expiry_date) {
    const estimated = item.expiry_kind === 'estimated';
    best = {
      date: toIsoDate(item.expiry_date),
      estimated,
      basis: estimated ? 'estimated' : 'printed',
    };
  }

  const afterOpening = item.opened_at
    ? findRule(rules, item.category, item.location)?.days_after_opening
    : undefined;
  if (item.opened_at && afterOpening !== undefined) {
    const date = addDays(toIsoDate(item.opened_at), afterOpening);
    if (!best || date < best.date) best = { date, estimated: true, basis: 'opened' };
  }

  return best;
}

/** The derived `effective_expiry` value for an item (design §3). */
export function effectiveExpiry(
  item: Pick<Item, 'expiry_date' | 'expiry_kind' | 'opened_at' | 'category' | 'location'>,
  rules: readonly ShelfLifeRule[],
): IsoDate | undefined {
  return resolveExpiry(item, rules)?.date;
}

/**
 * Expiry status, computed on read (design §3, Req 3.1).
 *
 * Uses `effective_expiry`, falling back to `expiry_date`. "Expiring soon" means
 * the date is today or within the next `soonDays` days. Returns null for items
 * with no date or `expiry_kind = 'none'` (Req 3.5).
 */
export function expiryStatus(
  item: Pick<Item, 'expiry_kind' | 'expiry_date' | 'effective_expiry'>,
  today: IsoDate,
  soonDays: number,
): ExpiryStatus | null {
  if (item.expiry_kind === 'none') return null;
  const date = item.effective_expiry ?? item.expiry_date;
  if (!date) return null;
  const daysLeft = daysBetween(today, toIsoDate(date));
  if (daysLeft < 0) return 'expired';
  if (daysLeft <= soonDays) return 'expiring_soon';
  return 'fresh';
}
