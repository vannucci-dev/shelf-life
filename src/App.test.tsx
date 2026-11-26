import { act, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { App } from './App.tsx';

describe('App shell', () => {
  it('shows the app name and the four locations', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: 'Shelf Life' })).toBeInTheDocument();
    for (const name of ['Fridge', 'Freezer', 'Pantry', 'Spice rack']) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument();
    }
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
