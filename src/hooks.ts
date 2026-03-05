'use client';

import * as React from 'react';

export interface PWAUpdateState {
  updateAvailable: boolean;
  update: () => void;
  registration: ServiceWorkerRegistration | null;
}

function usePWAUpdate(): PWAUpdateState {
  const [updateAvailable, setUpdateAvailable] = React.useState(false);
  const [registration, setRegistration] = React.useState<ServiceWorkerRegistration | null>(null);

  React.useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      return;
    }

    const handleUpdate = () => {
      setUpdateAvailable(true);
    };

    window.addEventListener('pwa-update-available', handleUpdate);

    const serviceWorker = navigator.serviceWorker as
      | (ServiceWorkerContainer & { ready?: Promise<ServiceWorkerRegistration> })
      | undefined;
    const readyPromise = serviceWorker?.ready;
    if (readyPromise && typeof readyPromise.then === 'function') {
      readyPromise.then((reg) => {
        setRegistration(reg);
      });
    }

    return () => {
      window.removeEventListener('pwa-update-available', handleUpdate);
    };
  }, []);

  const update = React.useCallback(() => {
    if (!registration?.waiting) return;
    registration.waiting.postMessage({ type: 'SKIP_WAITING' });
    if ('serviceWorker' in navigator && typeof navigator.serviceWorker.addEventListener === 'function') {
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        window.location.reload();
      });
    }
  }, [registration]);
  return { updateAvailable, update, registration };
}

export default usePWAUpdate;
