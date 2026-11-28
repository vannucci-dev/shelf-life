import type { IsoDate, Item } from '../domain';
import { describeExpiry } from './describeExpiry';

interface Props {
  item: Item;
  today: IsoDate;
  soonDays: number;
  onOpen: (item: Item) => void;
  onStep: (item: Item, delta: 1 | -1) => void;
}

function formatQuantity(item: Item): string {
  const qty = item.quantity ?? 0;
  return item.unit ? `${qty} ${item.unit}` : String(qty);
}

/** One item: name, expiry badge and, when it has a quantity, a stepper (Req 1.5). */
export function ItemRow({ item, today, soonDays, onOpen, onStep }: Props) {
  const expiry = describeExpiry(item, today, soonDays);
  return (
    <li className="item-row" data-status={expiry.status ?? 'none'}>
      <button type="button" className="item-main" onClick={() => onOpen(item)}>
        <span className="item-name">{item.name}</span>
        {(expiry.badge || expiry.date) && (
          <span className="item-expiry">
            {expiry.badge && <span className={`badge badge-${expiry.status}`}>{expiry.badge}</span>}
            {expiry.date && <span className="item-date">{expiry.date}</span>}
          </span>
        )}
      </button>
      {item.quantity !== undefined && (
        <div className="stepper" role="group" aria-label={`Quantity of ${item.name}`}>
          <button
            type="button"
            aria-label={`One less ${item.name}`}
            disabled={item.quantity <= 0}
            onClick={() => onStep(item, -1)}
          >
            −
          </button>
          <output aria-live="polite">{formatQuantity(item)}</output>
          <button
            type="button"
            aria-label={`One more ${item.name}`}
            onClick={() => onStep(item, 1)}
          >
            +
          </button>
        </div>
      )}
    </li>
  );
}
