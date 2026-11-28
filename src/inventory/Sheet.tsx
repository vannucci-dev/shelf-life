import { useEffect, useId, type ReactNode } from 'react';

interface Props {
  title: string;
  role?: 'dialog' | 'alertdialog';
  onClose: () => void;
  children: ReactNode;
}

/** A bottom sheet on phones, a centred panel on wider screens. Escape or the backdrop closes it. */
export function Sheet({ title, role = 'dialog', onClose, children }: Props) {
  const titleId = useId();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="sheet-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet" role={role} aria-modal="true" aria-labelledby={titleId}>
        <h2 id={titleId}>{title}</h2>
        {children}
      </div>
    </div>
  );
}
