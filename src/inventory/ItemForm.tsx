import { useId, useState, type FormEvent } from 'react';
import { LOCATIONS, type ExpiryKind, type Item, type Location } from '../domain';
import { LOCATION_LABELS } from './locations';

/** The values the form produces. Empty optional fields are `null`, so an edit clears them. */
export interface ItemFormValues {
  name: string;
  location: Location;
  quantity: number | null;
  unit: string | null;
  expiry_date: string | null;
  expiry_kind: ExpiryKind;
  opened_at: string | null;
  notes: string | null;
}

type DatedKind = Exclude<ExpiryKind, 'none'>;

const DATE_KINDS: readonly { id: DatedKind; label: string }[] = [
  { id: 'best_before', label: 'Best before' },
  { id: 'use_by', label: 'Use by' },
  { id: 'estimated', label: 'My estimate' },
];

interface Props {
  /** The item being edited. Without it the form adds a new item. */
  item?: Item;
  defaultLocation: Location;
  submitLabel: string;
  onSubmit: (values: ItemFormValues) => Promise<void>;
  onCancel: () => void;
}

/** Add/edit form (Req 1.1, 1.3). Only the name is required; the location comes from the open tab. */
export function ItemForm({ item, defaultLocation, submitLabel, onSubmit, onCancel }: Props) {
  const id = useId();
  const [name, setName] = useState(item?.name ?? '');
  const [location, setLocation] = useState<Location>(item?.location ?? defaultLocation);
  const [quantity, setQuantity] = useState(item?.quantity?.toString() ?? '');
  const [unit, setUnit] = useState(item?.unit ?? '');
  const [expiryDate, setExpiryDate] = useState(item?.expiry_date ?? '');
  const [kind, setKind] = useState<DatedKind>(
    item && item.expiry_kind !== 'none' ? item.expiry_kind : 'best_before',
  );
  const [openedAt, setOpenedAt] = useState(item?.opened_at ?? '');
  const [notes, setNotes] = useState(item?.notes ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Give the item a name.');
      return;
    }
    const qty = quantity.trim() === '' ? null : Number(quantity);
    if (qty !== null && (!Number.isFinite(qty) || qty < 0)) {
      setError('Quantity must be zero or more.');
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await onSubmit({
        name: trimmed,
        location,
        quantity: qty,
        unit: unit.trim() || null,
        expiry_date: expiryDate || null,
        expiry_kind: expiryDate ? kind : 'none',
        opened_at: openedAt || null,
        notes: notes.trim() || null,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the item.');
      setSaving(false);
    }
  }

  return (
    <form className="item-form" onSubmit={(e) => void submit(e)} noValidate>
      <label className="field">
        <span>Name</span>
        <input
          name="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="off"
          required
          aria-invalid={error !== null && !name.trim()}
          aria-describedby={error ? `${id}-error` : undefined}
        />
      </label>

      {!item && (
        <label className="field">
          <span>Location</span>
          <select value={location} onChange={(e) => setLocation(e.target.value as Location)}>
            {LOCATIONS.map((l) => (
              <option key={l} value={l}>
                {LOCATION_LABELS[l]}
              </option>
            ))}
          </select>
        </label>
      )}

      <div className="field-row">
        <label className="field">
          <span>Quantity</span>
          <input
            name="quantity"
            type="number"
            inputMode="decimal"
            min={0}
            step="any"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
          />
        </label>
        <label className="field">
          <span>Unit</span>
          <input
            name="unit"
            value={unit}
            placeholder="g, L, jar…"
            onChange={(e) => setUnit(e.target.value)}
            autoComplete="off"
          />
        </label>
      </div>

      <div className="field-row">
        <label className="field">
          <span>Expiry date</span>
          <input
            name="expiry_date"
            type="date"
            value={expiryDate}
            onChange={(e) => setExpiryDate(e.target.value)}
          />
        </label>
        {expiryDate && (
          <label className="field">
            <span>Date type</span>
            <select value={kind} onChange={(e) => setKind(e.target.value as DatedKind)}>
              {DATE_KINDS.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.label}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      <label className="field">
        <span>Opened on</span>
        <input
          name="opened_at"
          type="date"
          value={openedAt}
          onChange={(e) => setOpenedAt(e.target.value)}
        />
      </label>

      <label className="field">
        <span>Notes</span>
        <textarea name="notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </label>

      {error && (
        <p className="form-error" id={`${id}-error`} role="alert">
          {error}
        </p>
      )}

      <div className="form-actions">
        <button type="button" className="button secondary" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="button" disabled={saving}>
          {submitLabel}
        </button>
      </div>
    </form>
  );
}
