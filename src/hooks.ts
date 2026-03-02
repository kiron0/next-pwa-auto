'use client';

import { useCallback, useEffect, useState } from 'react';

export interface PWAUpdateState {
  updateAvailable: boolean;
  update: () => void;
  registration: ServiceWorkerRegistration | null;
}

export function usePWAUpdate(): PWAUpdateState {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      return;
    }

    const handleUpdate = () => {
      setUpdateAvailable(true);
    };

    window.addEventListener('pwa-update-available', handleUpdate);

    navigator.serviceWorker.ready.then((reg) => {
      setRegistration(reg);
    });

    return () => {
      window.removeEventListener('pwa-update-available', handleUpdate);
    };
  }, []);

  const update = useCallback(() => {
    if (!registration?.waiting) return;
    registration.waiting.postMessage({ type: 'SKIP_WAITING' });
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      window.location.reload();
    });
  }, [registration]);
  return { updateAvailable, update, registration };
}
export default usePWAUpdate;
