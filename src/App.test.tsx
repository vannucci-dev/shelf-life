import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { App } from './App.tsx';

describe('App shell', () => {
  it('shows the app name and the four locations', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: 'Shelf Life' })).toBeInTheDocument();
    for (const name of ['Fridge', 'Freezer', 'Pantry', 'Spice rack']) {
      expect(screen.getByRole('tab', { name })).toBeInTheDocument();
    }
  });

  it('switches location when a tab is clicked', () => {
    render(<App />);
    expect(screen.getByRole('tab', { name: 'Fridge' })).toHaveAttribute('aria-selected', 'true');

    fireEvent.click(screen.getByRole('tab', { name: 'Pantry' }));

    expect(screen.getByRole('tab', { name: 'Pantry' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Fridge' })).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Nothing in the pantry yet.');
  });

  it('moves between tabs with the arrow keys', () => {
    render(<App />);
    const fridge = screen.getByRole('tab', { name: 'Fridge' });
    fridge.focus();

    fireEvent.keyDown(fridge, { key: 'ArrowLeft' });
    const spiceRack = screen.getByRole('tab', { name: 'Spice rack' });
    expect(spiceRack).toHaveAttribute('aria-selected', 'true');
    expect(spiceRack).toHaveFocus();

    fireEvent.keyDown(spiceRack, { key: 'ArrowRight' });
    expect(fridge).toHaveAttribute('aria-selected', 'true');
  });

  it('shows an offline badge when the connection drops', () => {
    const onLine = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    render(<App />);
    expect(screen.queryByText('Offline')).not.toBeInTheDocument();

    onLine.mockReturnValue(false);
    act(() => {
      window.dispatchEvent(new Event('offline'));
    });
    expect(screen.getByRole('status')).toHaveTextContent('Offline');
    onLine.mockRestore();
  });
});
