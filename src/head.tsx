'use client';

import { useEffect } from 'react';

export interface PWAHeadProps {
  manifest?: string;
  themeColor?: string;
  swRegisterPath?: string;
  enableSW?: boolean;
}

function PWAHead({
  manifest = '/manifest.webmanifest',
  themeColor = '#000000',
  swRegisterPath = '/_pwa/sw-register.js',
  enableSW,
}: PWAHeadProps = {}) {
  const isDev = process.env.NODE_ENV === 'development';
  const shouldEnableSW = enableSW ?? !isDev;

  useEffect(() => {
    if (!shouldEnableSW) {
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistrations().then((registrations) => {
          for (const registration of registrations) {
            registration.unregister();
          }
          if (registrations.length > 0) {
            console.log('[next-pwa-auto] 🧹 Unregistered stale service workers in dev mode');
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

  return (
    <>
      <link rel="manifest" href={manifest} />
      <meta name="theme-color" content={themeColor} />
      <meta name="apple-mobile-web-app-capable" content="yes" />
      <meta name="apple-mobile-web-app-status-bar-style" content="default" />
      <meta name="mobile-web-app-capable" content="yes" />
    </>
  );
}

export default PWAHead;
