'use client';

import { useEffect, useMemo, useState } from 'react';
import usePWAUpdate from './hooks';

export interface PWAHeadProps {
  manifest?: string;
  themeColor?: string;
  swRegisterPath?: string;
  enableSW?: boolean;
  enableUpdateUI?: boolean;
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

function PWAHead({
  manifest = '/manifest.webmanifest',
  themeColor = '#000000',
  swRegisterPath = '/_pwa/sw-register.js',
  enableSW,
  enableUpdateUI = false,
}: PWAHeadProps = {}) {
  const isDev = process.env.NODE_ENV === 'development';
  const shouldEnableSW = enableSW ?? !isDev;
  const { updateAvailable, update } = usePWAUpdate();
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!shouldEnableSW) {
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistrations().then((registrations) => {
          for (const registration of registrations) {
            registration.unregister();
          }
          if (registrations.length > 0) {
            console.log('[next-pwa-auto] ' + String.fromCodePoint(0x1f9f9) + ' Unregistered stale service workers in dev mode');
          }
        });
      }
      return;
    }

    const script = document.createElement('script');
    script.src = swRegisterPath;
    script.async = true;
    document.body.appendChild(script);

    return () => {
      if (script.parentNode) {
        script.parentNode.removeChild(script);
      }
    };
  }, [shouldEnableSW, swRegisterPath]);

  useEffect(() => {
    if (!enableUpdateUI) {
      return;
    }

    const onBeforeInstallPrompt = (event: Event) => {
      const installEvent = event as BeforeInstallPromptEvent;
      if (!installEvent || typeof installEvent.prompt !== 'function') {
        return;
      }
      event.preventDefault();
      setInstallPrompt(installEvent);
      setDismissed(false);
    };

    const onAppInstalled = () => {
      setInstallPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt as EventListener);
    window.addEventListener('appinstalled', onAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt as EventListener);
      window.removeEventListener('appinstalled', onAppInstalled);
    };
  }, [enableUpdateUI]);

  const showUpdateUI = useMemo(() => {
    if (!enableUpdateUI || dismissed) {
      return false;
    }
    return updateAvailable || Boolean(installPrompt);
  }, [dismissed, enableUpdateUI, installPrompt, updateAvailable]);

  const onInstallClick = async () => {
    if (!installPrompt) {
      return;
    }

    try {
      await installPrompt.prompt();
      await installPrompt.userChoice;
    } finally {
      setInstallPrompt(null);
    }
  };

  return (
    <>
      <link rel="manifest" href={manifest} />
      <meta name="theme-color" content={themeColor} />
      <meta name="apple-mobile-web-app-capable" content="yes" />
      <meta name="apple-mobile-web-app-status-bar-style" content="default" />
      <meta name="mobile-web-app-capable" content="yes" />
      {showUpdateUI ? (
        <div
          data-pwa-update-ui
          style={{
            position: 'fixed',
            left: 16,
            right: 16,
            bottom: 16,
            zIndex: 9999,
            background: '#111827',
            color: '#ffffff',
            borderRadius: 10,
            padding: '12px 14px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.28)',
            fontSize: 14,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <span>
            {updateAvailable
              ? 'A new version is available.'
              : 'Install this app for a better offline experience.'}
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            {installPrompt ? (
              <button
                type="button"
                onClick={onInstallClick}
                style={{
                  border: 0,
                  borderRadius: 6,
                  padding: '7px 10px',
                  cursor: 'pointer',
                  background: '#2563eb',
                  color: '#ffffff',
                }}
              >
                Install
              </button>
            ) : null}
            {updateAvailable ? (
              <button
                type="button"
                onClick={update}
                style={{
                  border: 0,
                  borderRadius: 6,
                  padding: '7px 10px',
                  cursor: 'pointer',
                  background: '#16a34a',
                  color: '#ffffff',
                }}
              >
                Update
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => setDismissed(true)}
              style={{
                border: '1px solid rgba(255,255,255,0.35)',
                borderRadius: 6,
                padding: '7px 10px',
                cursor: 'pointer',
                background: 'transparent',
                color: '#ffffff',
              }}
            >
              Dismiss
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}

export default PWAHead;
