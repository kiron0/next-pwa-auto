import { CacheStrategy, ResolvedConfig } from '../types';

const STRATEGY_MAP: Record<CacheStrategy, string> = {
  cacheFirst: 'CacheFirst',
  networkFirst: 'NetworkFirst',
  staleWhileRevalidate: 'StaleWhileRevalidate',
  networkOnly: 'NetworkOnly',
  cacheOnly: 'CacheOnly',
};

const UNSAFE_URL_PATTERNS = [
  /\/auth\//i,
  /\/callback/i,
  /\/token/i,
  /\/log-?in/i,
  /\/log-?out/i,
  /\/sign-?in/i,
  /\/sign-?out/i,
  /\/sign-?up/i,
  /\/oauth/i,
  /\/sso/i,
  /\/verify/i,
  /\/reset-?password/i,
  /\/forgot-?password/i,
  /\/session/i,
  /\/api\/auth/i,
  /\/_next\/image/i,
];

export function buildWorkboxOptions(config: ResolvedConfig) {
  const { cacheStrategies, workbox: workboxConfig, swDest, offline, pwaDir } = config;
  const runtimeCaching: any[] = [];

  const navigationOptions: any = {
    cacheName: 'pages-cache',
    expiration: {
      maxEntries: 50,
      maxAgeSeconds: 24 * 60 * 60,
    },
    networkTimeoutSeconds: 3,
  };

  if (offline) {
    navigationOptions.plugins = [
      {
        handlerDidError: async () => {
          return caches.match(`/${pwaDir}/offline.html`);
        },
      },
    ];
  }

  runtimeCaching.push({
    urlPattern: ({ request }: any) => request.mode === 'navigate',
    handler: STRATEGY_MAP[cacheStrategies.navigation || 'networkFirst'],
    options: navigationOptions,
  });

  runtimeCaching.push({
    urlPattern: /\/_next\/static\/.*/i,
    handler: STRATEGY_MAP[cacheStrategies.staticAssets || 'cacheFirst'],
    options: {
      cacheName: 'static-assets-cache',
      expiration: {
        maxEntries: 200,
        maxAgeSeconds: 365 * 24 * 60 * 60,
      },
    },
  });

  runtimeCaching.push({
    urlPattern: /\/_next\/data\/.*/i,
    handler: 'NetworkFirst',
    options: {
      cacheName: 'next-data-cache',
      expiration: {
        maxEntries: 50,
        maxAgeSeconds: 24 * 60 * 60,
      },
    },
  });

  runtimeCaching.push({
    urlPattern: /\.(?:jpg|jpeg|gif|png|svg|ico|webp|avif)$/i,
    handler: STRATEGY_MAP[cacheStrategies.images || 'staleWhileRevalidate'],
    options: {
      cacheName: 'images-cache',
      expiration: {
        maxEntries: 100,
        maxAgeSeconds: 30 * 24 * 60 * 60,
      },
    },
  });

  runtimeCaching.push({
    urlPattern: /\.(?:woff|woff2|ttf|otf|eot)$/i,
    handler: 'CacheFirst',
    options: {
      cacheName: 'fonts-cache',
      expiration: {
        maxEntries: 20,
        maxAgeSeconds: 365 * 24 * 60 * 60,
      },
    },
  });

  runtimeCaching.push({
    urlPattern: /\/api\/.*/i,
    handler: STRATEGY_MAP[cacheStrategies.api || 'networkOnly'],
    options: {
      cacheName: 'api-cache',
      ...(cacheStrategies.api && cacheStrategies.api !== 'networkOnly'
        ? {
            expiration: {
              maxEntries: 50,
              maxAgeSeconds: 5 * 60,
            },
            networkTimeoutSeconds: 3,
          }
        : {}),
    },
  });

  const excludePatterns: Array<RegExp | string> = [
    /\.map$/,
    /^manifest.*\.js$/,
    /\.next\/cache\/.*/,
    ...UNSAFE_URL_PATTERNS,
    ...(workboxConfig.exclude || []),
  ];

  const options: any = {
    swDest: swDest,
    skipWaiting: workboxConfig.skipWaiting ?? true,
    clientsClaim: workboxConfig.clientsClaim ?? true,
    maximumFileSizeToCacheInBytes: workboxConfig.maximumFileSizeToCacheInBytes ?? 5 * 1024 * 1024,
    runtimeCaching,
    exclude: excludePatterns,
    navigationPreload: true,
  };

  if (workboxConfig.additionalManifestEntries) {
    options.additionalManifestEntries = [...workboxConfig.additionalManifestEntries];
  }

  if (offline) {
    options.offlineGoogleAnalytics = false;

    if (!options.additionalManifestEntries) {
      options.additionalManifestEntries = [];
    }

    options.additionalManifestEntries.push({
      url: `/${pwaDir}/offline.html`,
      revision: Date.now().toString(),
    });
  }
  return options;
}

export function createSWWebpackPlugin(config: ResolvedConfig) {
  const isDev = process.env.NODE_ENV !== 'production';
  const forceEnable = process.env.NEXT_PWA === '1';

  if (isDev && config.disableInDev && !forceEnable) {
    return null;
  }

  try {
    const { GenerateSW } = require('workbox-webpack-plugin');
    const workboxOptions = buildWorkboxOptions(config);
    return new GenerateSW(workboxOptions);
  } catch (e) {
    console.error('[next-pwa-auto] ❌ Failed to load workbox-webpack-plugin:', e);
    return null;
  }
}
