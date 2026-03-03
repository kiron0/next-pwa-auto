export interface PWAAutoConfig {
  disable?: boolean;
  offline?: boolean;
  icon?: string;
  manifest?: Partial<WebAppManifest>;
  workbox?: WorkboxConfig;
  cacheStrategies?: CacheStrategyConfig;
  pwaDir?: string;
  disableInDev?: boolean;
  swDest?: string;
  scope?: string;
}

export interface ResolvedConfig {
  disable: boolean;
  offline: boolean;
  icon: string | null;
  manifest: Partial<WebAppManifest>;
  workbox: WorkboxConfig;
  cacheStrategies: CacheStrategyConfig;
  pwaDir: string;
  disableInDev: boolean;
  swDest: string;
  scope: string;
  projectRoot: string;
  routerType: 'app' | 'pages' | 'both';
  packageInfo: PackageInfo;
}

export interface PackageInfo {
  name: string;
  description: string;
  version: string;
}

export interface WebAppManifest {
  name: string;
  short_name: string;
  description: string;
  start_url: string;
  display: 'standalone' | 'fullscreen' | 'minimal-ui' | 'browser';
  background_color: string;
  theme_color: string;
  orientation?: 'any' | 'natural' | 'landscape' | 'portrait';
  icons: ManifestIcon[];
  scope?: string;
  lang?: string;
  dir?: 'ltr' | 'rtl' | 'auto';
  categories?: string[];
  screenshots?: ManifestScreenshot[];
  shortcuts?: ManifestShortcut[];
  id?: string;
}

export interface ManifestIcon {
  src: string;
  sizes: string;
  type: string;
  purpose?: 'any' | 'maskable' | 'monochrome';
}

export interface ManifestScreenshot {
  src: string;
  sizes: string;
  type: string;
  label?: string;
}

export interface ManifestShortcut {
  name: string;
  short_name?: string;
  description?: string;
  url: string;
  icons?: ManifestIcon[];
}

export interface WorkboxConfig {
  maximumFileSizeToCacheInBytes?: number;
  additionalManifestEntries?: Array<{
    url: string;
    revision: string | null;
  }>;
  skipWaiting?: boolean;
  clientsClaim?: boolean;
  exclude?: Array<RegExp | string>;
}

export interface CacheStrategyConfig {
  navigation?: CacheStrategy;
  staticAssets?: CacheStrategy;
  images?: CacheStrategy;
  api?: CacheStrategy;
}

export type CacheStrategy =
  | 'cacheFirst'
  | 'networkFirst'
  | 'staleWhileRevalidate'
  | 'networkOnly'
  | 'cacheOnly';
export interface NextConfig {
  webpack?: (config: any, context: any) => any;
  turbopack?: any;
  [key: string]: any;
}
