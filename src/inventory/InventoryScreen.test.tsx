import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { App } from '../App.tsx';
import type { Repository } from '../db';
import { addDays, toLocalIsoDate } from '../domain';
import { testRepository } from '../test/repository.ts';

let repo: Repository;
const today = toLocalIsoDate();

beforeEach(() => {
  repo = testRepository();
});

function renderApp() {
  return render(<App repository={repo} />);
}

const list = () => screen.findByRole('list', { name: /items$/ });
const row = async (name: string) =>
  (await screen.findByText(name, { selector: '.item-name' })).closest('li')!;

describe('Inventory screens', () => {
  it('adds an item to the open location and shows it at once (Req 1.1, 1.2)', async () => {
    renderApp();
    fireEvent.click(screen.getByRole('tab', { name: 'Pantry' }));
    fireEvent.click(await screen.findByRole('button', { name: '+ Add item' }));

    const dialog = screen.getByRole('dialog', { name: 'Add item' });
    expect(within(dialog).getByLabelText('Location')).toHaveValue('pantry');
    fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: ' Rice ' } });
    fireEvent.change(within(dialog).getByLabelText('Quantity'), { target: { value: '2' } });
    fireEvent.change(within(dialog).getByLabelText('Unit'), { target: { value: 'kg' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add' }));

    expect(await row('Rice')).toHaveTextContent('2 kg');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    const [saved] = await repo.items.listActive('pantry');
    expect(saved).toMatchObject({ name: 'Rice', quantity: 2, unit: 'kg', expiry_kind: 'none' });
  });

  it('requires a name', async () => {
    renderApp();
    fireEvent.click(await screen.findByRole('button', { name: '+ Add item' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Give the item a name.');
    expect(await repo.items.listActive()).toHaveLength(0);
  });

  it('shows expiry badges, soonest first, with use-by and best-before told apart', async () => {
    await repo.items.create({ name: 'Paprika', location: 'fridge' });
    await repo.items.create({
      name: 'Yoghurt',
      location: 'fridge',
      expiry_date: addDays(today, -1),
      expiry_kind: 'best_before',
    });
    await repo.items.create({
      name: 'Chicken',
      location: 'fridge',
      expiry_date: addDays(today, 1),
      expiry_kind: 'use_by',
    });
    await repo.items.create({
      name: 'Soup',
      location: 'fridge',
      expiry_date: addDays(today, 2),
      expiry_kind: 'estimated',
    });
    renderApp();

    const rows = within(await list()).getAllByRole('listitem');
    expect(rows.map((r) => r.querySelector('.item-name')!.textContent)).toEqual([
      'Yoghurt',
      'Chicken',
      'Soup',
      'Paprika',
    ]);
    expect(rows[0]).toHaveTextContent('Past best before');
    expect(rows[1]).toHaveTextContent(/Use soon.*Use by/);
    expect(rows[2]).toHaveTextContent(/Good until ~ /);
    expect(rows[3]).not.toHaveTextContent(/soon|Expired|until|by/);
  });

  it('edits an item and updates its expiry status (Req 1.3)', async () => {
    await repo.items.create({
      name: 'Milk',
      location: 'fridge',
      expiry_date: addDays(today, 10),
    });
    renderApp();
    fireEvent.click(within(await row('Milk')).getByRole('button', { name: /^Milk/ }));

    const dialog = screen.getByRole('dialog', { name: 'Edit Milk' });
    fireEvent.change(within(dialog).getByLabelText('Expiry date'), {
      target: { value: addDays(today, 1) },
    });
    fireEvent.change(within(dialog).getByLabelText('Date type'), { target: { value: 'use_by' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));

    await waitFor(async () => expect(await row('Milk')).toHaveTextContent('Use soon'));
    expect((await repo.items.listActive())[0]).toMatchObject({
      expiry_kind: 'use_by',
      expiry_date: addDays(today, 1),
    });
  });

  it('moves an item to another location without re-entering it (Req 1.6)', async () => {
    const milk = await repo.items.create({ name: 'Milk', location: 'fridge', quantity: 1 });
    renderApp();
    fireEvent.click(within(await row('Milk')).getByRole('button', { name: /^Milk/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Freezer' }));

    expect(await screen.findByText('Milk moved to the freezer')).toHaveRole('status');
    expect(await screen.findByText('Nothing in the fridge yet.')).toBeInTheDocument();
    expect(await repo.items.get(milk.id)).toMatchObject({ location: 'freezer', quantity: 1 });

    fireEvent.click(screen.getByRole('tab', { name: 'Freezer' }));
    expect(await row('Milk')).toBeInTheDocument();
  });

  it('steps the quantity and asks "used up?" at zero (Req 1.5)', async () => {
    const eggs = await repo.items.create({ name: 'Eggs', location: 'fridge', quantity: 1 });
    renderApp();
    const eggsRow = await row('Eggs');

    fireEvent.click(within(eggsRow).getByRole('button', { name: 'One more Eggs' }));
    await waitFor(() => expect(within(eggsRow).getByRole('status')).toHaveTextContent('2'));
    fireEvent.click(within(eggsRow).getByRole('button', { name: 'One less Eggs' }));
    await waitFor(() => expect(within(eggsRow).getByRole('status')).toHaveTextContent('1'));
    fireEvent.click(within(eggsRow).getByRole('button', { name: 'One less Eggs' }));

    const prompt = await screen.findByRole('alertdialog', { name: 'Used up Eggs?' });
    expect((await repo.items.get(eggs.id))?.quantity).toBe(0);

    fireEvent.click(within(prompt).getByRole('button', { name: 'Keep it' }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect((await repo.items.get(eggs.id))?.status).toBe('active');
  });

  it('records "used up" from the zero prompt (Req 1.4, 1.5)', async () => {
    const eggs = await repo.items.create({ name: 'Eggs', location: 'fridge', quantity: 1 });
    renderApp();
    fireEvent.click(within(await row('Eggs')).getByRole('button', { name: 'One less Eggs' }));
    const prompt = await screen.findByRole('alertdialog');
    fireEvent.click(within(prompt).getByRole('button', { name: 'Yes, used up' }));

    expect(await screen.findByText('Nothing in the fridge yet.')).toBeInTheDocument();
    expect(await repo.items.get(eggs.id)).toMatchObject({ status: 'consumed' });
  });

  it('records "thrown away" from the item sheet (Req 1.4)', async () => {
    const ham = await repo.items.create({ name: 'Ham', location: 'fridge' });
    renderApp();
    fireEvent.click(within(await row('Ham')).getByRole('button', { name: /^Ham/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Thrown away' }));

    expect(await screen.findByText('Ham marked as thrown away')).toHaveRole('status');
    expect(await repo.items.get(ham.id)).toMatchObject({ status: 'discarded' });
    // The list reloads asynchronously after the write, so wait for the row to go.
    await waitFor(() =>
      expect(screen.queryByText('Ham', { selector: '.item-name' })).not.toBeInTheDocument(),
    );
  });

  it('closes a sheet with Escape', async () => {
    renderApp();
    fireEvent.click(await screen.findByRole('button', { name: '+ Add item' }));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
