import { GenerateSW } from 'workbox-webpack-plugin';
import { CacheStrategy, ResolvedConfig, RoutePattern } from '../types';

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

const PROTECTED_ROUTE_PATTERNS: RoutePattern[] = [
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
];

export function buildWorkboxOptions(config: ResolvedConfig) {
  const { cacheStrategies, workbox: workboxConfig, swDest, offline, pwaDir, include, exclude } = config;
  const runtimeCaching: any[] = [];
  const includeMatchers = buildRouteMatchers(include);
  const excludeMatchers = buildRouteMatchers(exclude);
  const protectedMatchers = buildRouteMatchers(PROTECTED_ROUTE_PATTERNS);

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
    urlPattern: ({ request, url }: any) =>
      isCacheableRoute(getUrlPath(url), includeMatchers, excludeMatchers, protectedMatchers, true) &&
      request?.mode === 'navigate',
    handler: STRATEGY_MAP[cacheStrategies.navigation || 'networkFirst'],
    options: navigationOptions,
  });

  runtimeCaching.push({
    urlPattern: ({ url }: any) =>
      isCacheableRoute(getUrlPath(url), includeMatchers, excludeMatchers, protectedMatchers, false) &&
      /\/_next\/static\/.*/i.test(getUrlPath(url)),
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
    urlPattern: ({ url }: any) =>
      isCacheableRoute(getUrlPath(url), includeMatchers, excludeMatchers, protectedMatchers, false) &&
      /\/_next\/data\/.*/i.test(getUrlPath(url)),
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
    urlPattern: ({ url }: any) =>
      isCacheableRoute(getUrlPath(url), includeMatchers, excludeMatchers, protectedMatchers, false) &&
      /\.(?:jpg|jpeg|gif|png|svg|ico|webp|avif)$/i.test(getUrlPath(url)),
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
    urlPattern: ({ url }: any) =>
      isCacheableRoute(getUrlPath(url), includeMatchers, excludeMatchers, protectedMatchers, false) &&
      /\.(?:woff|woff2|ttf|otf|eot)$/i.test(getUrlPath(url)),
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
    urlPattern: ({ url }: any) =>
      isCacheableRoute(getUrlPath(url), includeMatchers, excludeMatchers, protectedMatchers, false) &&
      /\/api\/.*/i.test(getUrlPath(url)),
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

function isCacheableRoute(
  pathname: string,
  includeMatchers: Array<(value: string) => boolean>,
  excludeMatchers: Array<(value: string) => boolean>,
  protectedMatchers: Array<(value: string) => boolean>,
  onlyForNavigation: boolean
): boolean {
  if (!pathname) return false;
  if (protectedMatchers.some((matcher) => matcher(pathname))) {
    return false;
  }
  if (onlyForNavigation && pathname === '/') {
    return includeMatchers.length === 0;
  }
  if (excludeMatchers.some((matcher) => matcher(pathname))) {
    return false;
  }
  if (includeMatchers.length === 0) {
    return true;
  }
  return includeMatchers.some((matcher) => matcher(pathname));
}

function getUrlPath(urlValue: unknown): string {
  if (!urlValue) return '';
  if (typeof urlValue === 'string') {
    return normalizeUrlPath(urlValue);
  }

  if (typeof urlValue === 'object' && urlValue !== null) {
    const candidate = (urlValue as { pathname?: unknown; href?: unknown }).pathname;
    if (typeof candidate === 'string') {
      return normalizeUrlPath(candidate);
    }
    const href = (urlValue as { href?: unknown }).href;
    if (typeof href === 'string') {
      return normalizeUrlPath(href);
    }
  }

  return '';
}

function normalizeUrlPath(url: string): string {
  if (!url) {
    return '';
  }
  try {
    const parsed = new URL(url);
    return parsed.pathname || '/';
  } catch {
    return url.split('?')[0] || '/';
  }
}

function buildRouteMatchers(patterns: RoutePattern[]): Array<(value: string) => boolean> {
  return patterns.map(patternToMatcher);
}

function patternToMatcher(pattern: RoutePattern): (value: string) => boolean {
  const matcher = toRouteRegExp(pattern);
  return (value: string) => matcher.test(value);
}

function toRouteRegExp(pattern: RoutePattern): RegExp {
  if (pattern instanceof RegExp) {
    return pattern;
  }

  const regexLiteral = parseRegexLiteral(pattern);
  if (regexLiteral) {
    return regexLiteral;
  }

  if (isRegexPattern(pattern)) {
    try {
      return new RegExp(pattern);
    } catch {
      return globToRegExp(pattern);
    }
  }
  return globToRegExp(pattern);
}

function isRegexPattern(pattern: string): boolean {
  return pattern.startsWith('^') || pattern.endsWith('$');
}

function globToRegExp(pattern: string): RegExp {
  const value = pattern.trim();
  if (!value) {
    return /^$/;
  }

  let source = '';
  for (let i = 0; i < value.length; i += 1) {
    const char = value[i];
    if (char === '*') {
      if (value[i + 1] === '*') {
        source += '.*';
        i += 1;
      } else {
        source += '[^/]*';
      }
      continue;
    }
    if (char === '?') {
      source += '[^/]';
      continue;
    }
    source += escapeRegExpChar(char);
  }
  return new RegExp(`^${source}$`);
}

function parseRegexLiteral(pattern: string): RegExp | null {
  if (!pattern.startsWith('/') || pattern.length < 2) {
    return null;
  }
  const lastSlash = pattern.lastIndexOf('/');
  if (lastSlash <= 0) {
    return null;
  }

  const source = pattern.slice(1, lastSlash);
  const flags = pattern.slice(lastSlash + 1);
  if (!source) {
    return null;
  }

  if (!/^[a-z]*$/i.test(flags)) {
    return null;
  }

  try {
    return new RegExp(source, flags);
  } catch {
    return null;
  }
}

function escapeRegExpChar(char: string): string {
  return /[\\^$.*+?()[\]{}|]/.test(char) ? `\\${char}` : char;
}

export function createSWWebpackPlugin(config: ResolvedConfig) {
  const isDev = process.env.NODE_ENV !== 'production';
  const forceEnable = process.env.NEXT_PWA === '1';

  if (isDev && config.disableInDev && !forceEnable) {
    return null;
  }

  try {
    const workboxOptions = buildWorkboxOptions(config);
    return new GenerateSW(workboxOptions);
  } catch (e) {
    console.error(
      '[next-pwa-auto] ' + String.fromCodePoint(0x274c) + ' Failed to load workbox-webpack-plugin:',
      e
    );
    return null;
  }
}
