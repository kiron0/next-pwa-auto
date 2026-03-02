export function getSWRegisterScript(swPath: string = '/sw.js', scope: string = '/'): string {
  return `
if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  window.addEventListener('load', function() {
    navigator.serviceWorker
      .register('${swPath}', { scope: '${scope}' })
      .then(function(registration) {
        console.log('[next-pwa-auto] ✅ Service Worker registered with scope:', registration.scope);
        setInterval(function() {
          registration.update();
        }, 60 * 60 * 1000);
        registration.addEventListener('updatefound', function() {
          var newWorker = registration.installing;
          if (newWorker) {
            newWorker.addEventListener('statechange', function() {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                console.log('[next-pwa-auto] 🔄 New content available, will update on next visit.');
                window.dispatchEvent(new CustomEvent('pwa-update-available'));
              }
            });
          }
        });
        window.__PWA_AUTO = {
          registration: registration,
          version: '0.1.0',
          scope: '${scope}',
          swPath: '${swPath}',
          update: function() {
            return registration.update();
          },
          skipWaiting: function() {
            if (registration.waiting) {
              registration.waiting.postMessage({ type: 'SKIP_WAITING' });
            }
          }
        };
      })
      .catch(function(error) {
        console.error('[next-pwa-auto] ❌ Service Worker registration failed:', error);
      });
    var refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', function() {
      if (refreshing) return;
      refreshing = true;
      console.log('[next-pwa-auto] 🔄 Service Worker updated, reloading...');
    });
  });
}
`.trim();
}

export function generateSWRegisterFile(swPath: string = '/sw.js', scope: string = '/'): string {
  return `(function() {
  ${getSWRegisterScript(swPath, scope)}
})();
`;
}
