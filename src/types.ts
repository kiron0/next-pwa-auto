export type RoutePattern = string | RegExp;

export type CachePreset = 'default' | 'static' | 'api-first' | 'readonly' | 'offline-first';

export type CacheStrategy =
  | 'cacheFirst'
  | 'networkFirst'
  | 'staleWhileRevalidate'
  | 'networkOnly'
  | 'cacheOnly';

export interface IconThemeVariantConfig {
  name: string;
  themeColor: string;
}

export interface IconPipelineConfig {
  maskable?: boolean;
  sizes?: number[];
  themeVariants?: IconThemeVariantConfig[];
}

export interface ResolvedIconPipelineConfig {
  maskable: boolean;
  sizes: number[];
  themeVariants: IconThemeVariantConfig[];
}

export interface PWAAutoConfig {
  disable?: boolean;
  offline?: boolean;
  icon?: string;
  icons?: IconPipelineConfig;
  skipGeneratedIcons?: boolean;
  manifest?: Partial<WebAppManifest>;
  workbox?: WorkboxConfig;
  cacheStrategies?: CacheStrategyConfig;
  preset?: CachePreset;
  include?: RoutePattern[];
  exclude?: RoutePattern[];
  pwaDir?: string;
  disableInDev?: boolean;
  swDest?: string;
  scope?: string;
}

export interface ResolvedConfig {
  disable: boolean;
  offline: boolean;
  icon: string | null;
  icons: ResolvedIconPipelineConfig;
  skipGeneratedIcons: boolean;
  manifest: Partial<WebAppManifest>;
  workbox: WorkboxConfig;
  cacheStrategies: CacheStrategyConfig;
  preset: CachePreset;
  include: RoutePattern[];
  exclude: RoutePattern[];
  pwaDir: string;
  disableInDev: boolean;
  swDest: string;
  scope: string;
  projectRoot: string;
  routerType: 'app' | 'pages';
  packageInfo: PackageInfo;
}

export interface PackageInfo {
  name: string;
  description: string;
  version: string;
  keywords: string[];
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
export interface NextConfig {
  webpack?: (config: any, context: any) => any;
  turbopack?: any;
  [key: string]: any;
}
