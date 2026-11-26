import { useRegisterSW } from 'virtual:pwa-register/react';

/**
 * Registers the service worker and shows a small banner when a new version is
 * ready, so an update never reloads the page while the user is editing.
 */
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  if (!needRefresh) return null;

  return (
    <div className="update-banner" role="alert">
      <span>A new version of Shelf Life is ready.</span>
      <button type="button" onClick={() => void updateServiceWorker(true)}>
        Update
      </button>
      <button type="button" className="secondary" onClick={() => setNeedRefresh(false)}>
        Later
      </button>
    </div>
  );
}
