import { useEffect, useState } from 'react';
import type { FinishReason } from '../db';
import { LOCATIONS, toLocalIsoDate, type Item, type Location } from '../domain';
import { ItemForm, type ItemFormValues } from './ItemForm';
import { ItemRow } from './ItemRow';
import { LOCATION_LABELS } from './locations';
import { useRepository } from './repositoryContext';
import { Sheet } from './Sheet';
import { useInventory } from './useInventory';

type Panel =
  { kind: 'add' } | { kind: 'edit'; item: Item } | { kind: 'used-up'; item: Item } | null;

const FINISHED_MESSAGE: Record<FinishReason, string> = {
  consumed: 'marked as used up',
  discarded: 'marked as thrown away',
};

/** The item list for one location, with add, edit, move, quantity and finish actions (Req 1.1–1.6). */
export function InventoryScreen({ location }: { location: Location }) {
  const repo = useRepository();
  const { items, soonDays, refresh } = useInventory(location);
  const [panel, setPanel] = useState<Panel>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const today = toLocalIsoDate();
  const label = LOCATION_LABELS[location];

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(timer);
  }, [notice]);

  const close = () => setPanel(null);

  async function add(values: ItemFormValues) {
    const created = await repo.items.create({
      name: values.name,
      location: values.location,
      quantity: values.quantity ?? undefined,
      unit: values.unit ?? undefined,
      expiry_date: values.expiry_date ?? undefined,
      expiry_kind: values.expiry_kind,
      opened_at: values.opened_at ?? undefined,
      notes: values.notes ?? undefined,
    });
    close();
    refresh();
    if (created.location !== location) {
      setNotice(`${created.name} added to the ${LOCATION_LABELS[created.location].toLowerCase()}`);
    }
  }

  async function save(item: Item, values: ItemFormValues) {
    // The location changes through "Move to", not the form.
    const { name, quantity, unit, expiry_date, expiry_kind, opened_at, notes } = values;
    const updated = await repo.items.update(item.id, {
      name,
      quantity,
      unit,
      expiry_date,
      expiry_kind,
      opened_at,
      notes,
    });
    refresh();
    if (updated.quantity === 0 && item.quantity !== 0) setPanel({ kind: 'used-up', item: updated });
    else close();
  }

  async function move(item: Item, to: Location) {
    await repo.items.move(item.id, to);
    close();
    refresh();
    setNotice(`${item.name} moved to the ${LOCATION_LABELS[to].toLowerCase()}`);
  }

  async function finish(item: Item, reason: FinishReason) {
    await repo.items.finish(item.id, reason);
    close();
    refresh();
    setNotice(`${item.name} ${FINISHED_MESSAGE[reason]}`);
  }

  async function step(item: Item, delta: 1 | -1) {
    const next = Math.max(0, (item.quantity ?? 0) + delta);
    const updated = await repo.items.update(item.id, { quantity: next });
    refresh();
    if (next === 0) setPanel({ kind: 'used-up', item: updated });
  }

  return (
    <>
      {items === null ? null : items.length === 0 ? (
        <div className="empty-state">
          <p>Nothing in the {label.toLowerCase()} yet.</p>
          <p className="muted">Items you add will show up here, even when you're offline.</p>
        </div>
      ) : (
        <ul className="item-list" aria-label={`${label} items`}>
          {items.map((item) => (
            <ItemRow
              key={item.id}
              item={item}
              today={today}
              soonDays={soonDays}
              onOpen={(i) => setPanel({ kind: 'edit', item: i })}
              onStep={(i, d) => void step(i, d)}
            />
          ))}
        </ul>
      )}

      <button type="button" className="fab" onClick={() => setPanel({ kind: 'add' })}>
        + Add item
      </button>

      {notice && (
        <div className="toast" role="status">
          {notice}
        </div>
      )}

      {panel?.kind === 'add' && (
        <Sheet title="Add item" onClose={close}>
          <ItemForm defaultLocation={location} submitLabel="Add" onSubmit={add} onCancel={close} />
        </Sheet>
      )}

      {panel?.kind === 'edit' && (
        <Sheet title={`Edit ${panel.item.name}`} onClose={close}>
          <ItemForm
            item={panel.item}
            defaultLocation={location}
            submitLabel="Save"
            onSubmit={(values) => save(panel.item, values)}
            onCancel={close}
          />
          <section className="sheet-section" aria-label="Move to">
            <h3>Move to</h3>
            <div className="chip-row">
              {LOCATIONS.filter((l) => l !== panel.item.location).map((l) => (
                <button
                  key={l}
                  type="button"
                  className="chip"
                  onClick={() => void move(panel.item, l)}
                >
                  {LOCATION_LABELS[l]}
                </button>
              ))}
            </div>
          </section>
          <section className="sheet-section" aria-label="Finished with it">
            <h3>Finished with it?</h3>
            <div className="chip-row">
              <button
                type="button"
                className="button"
                onClick={() => void finish(panel.item, 'consumed')}
              >
                Used
              </button>
              <button
                type="button"
                className="button danger"
                onClick={() => void finish(panel.item, 'discarded')}
              >
                Thrown away
              </button>
            </div>
          </section>
        </Sheet>
      )}

      {panel?.kind === 'used-up' && (
        <Sheet title={`Used up ${panel.item.name}?`} role="alertdialog" onClose={close}>
          <p className="muted">The quantity is now zero.</p>
          <div className="chip-row">
            <button
              type="button"
              className="button"
              onClick={() => void finish(panel.item, 'consumed')}
            >
              Yes, used up
            </button>
            <button
              type="button"
              className="button danger"
              onClick={() => void finish(panel.item, 'discarded')}
            >
              Thrown away
            </button>
            <button type="button" className="button secondary" onClick={close}>
              Keep it
            </button>
          </div>
        </Sheet>
      )}
    </>
  );
}
