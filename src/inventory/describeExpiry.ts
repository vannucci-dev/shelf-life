import {
  SHELF_LIFE_RULES,
  expiryStatus,
  formatShortDate,
  resolveExpiry,
  type ExpiryStatus,
  type IsoDate,
  type Item,
  type ShelfLifeRule,
} from '../domain';

export interface ExpiryDescription {
  status: ExpiryStatus | null;
  /** Short status word for the badge, e.g. "Use soon". Null for fresh items and items with no date. */
  badge: string | null;
  /** The date line, e.g. "Use by 4 Dec" or "Opened, use by ~ 6 Dec". Null when there is no date. */
  date: string | null;
}

type ExpiryFields = Pick<
  Item,
  'expiry_date' | 'expiry_kind' | 'opened_at' | 'category' | 'location' | 'effective_expiry'
>;

/**
 * What an item row shows about its expiry (Req 3.1, 3.4, 4.2).
 *
 * Use-by dates are about safety and best-before dates about quality (Req 3.4),
 * so a past best-before reads "Past best before" rather than "Expired".
 * Estimated dates carry "~" (Req 4.2). Items with no expiry show nothing (Req 3.5).
 */
export function describeExpiry(
  item: ExpiryFields,
  today: IsoDate,
  soonDays: number,
  rules: readonly ShelfLifeRule[] = SHELF_LIFE_RULES,
): ExpiryDescription {
  const resolved = resolveExpiry(item, rules);
  if (!resolved) return { status: null, badge: null, date: null };

  const status = expiryStatus({ ...item, effective_expiry: resolved.date }, today, soonDays);
  const label = formatShortDate(resolved.date, { estimated: resolved.estimated, reference: today });

  let prefix: string;
  if (resolved.basis === 'opened') prefix = 'Opened, use by';
  else if (item.expiry_kind === 'use_by') prefix = 'Use by';
  else if (item.expiry_kind === 'best_before') prefix = 'Best before';
  else prefix = 'Good until';

  let badge: string | null = null;
  if (status === 'expiring_soon') badge = 'Use soon';
  else if (status === 'expired') {
    badge =
      item.expiry_kind === 'best_before' && resolved.basis === 'printed'
        ? 'Past best before'
        : 'Expired';
  }

  return { status, badge, date: `${prefix} ${label}` };
}
