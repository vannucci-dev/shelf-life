import type { ShelfLifeRule } from './types';
import data from './shelf-life-rules.json';

/**
 * Seed shelf-life estimates per category and location (Req 4.1).
 * Conservative household guidance (FSA / WRAP style), not safety advice:
 * a printed use-by date always wins when it is earlier.
 */
export const SHELF_LIFE_RULES: readonly ShelfLifeRule[] = data.rules as ShelfLifeRule[];
