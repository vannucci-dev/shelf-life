import { useRef, type KeyboardEvent } from 'react';

export interface LocationTab {
  id: string;
  label: string;
}

interface Props {
  tabs: readonly LocationTab[];
  selected: string;
  onSelect: (id: string) => void;
}

/** Location switcher following the WAI-ARIA tabs pattern (arrow keys, Home, End). */
export function LocationTabs({ tabs, selected, onSelect }: Props) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  function onKeyDown(e: KeyboardEvent, index: number) {
    const last = tabs.length - 1;
    const next =
      e.key === 'ArrowRight'
        ? index === last
          ? 0
          : index + 1
        : e.key === 'ArrowLeft'
          ? index === 0
            ? last
            : index - 1
          : e.key === 'Home'
            ? 0
            : e.key === 'End'
              ? last
              : null;
    if (next === null) return;
    e.preventDefault();
    onSelect(tabs[next]!.id);
    refs.current[next]?.focus();
  }

  return (
    <div className="tabs" role="tablist" aria-label="Locations">
      {tabs.map((tab, i) => {
        const isSelected = tab.id === selected;
        return (
          <button
            key={tab.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="tab"
            id={`tab-${tab.id}`}
            className="tab"
            aria-selected={isSelected}
            aria-controls={`panel-${tab.id}`}
            tabIndex={isSelected ? 0 : -1}
            onClick={() => onSelect(tab.id)}
            onKeyDown={(e) => onKeyDown(e, i)}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
