import * as fs from 'fs';
import * as path from 'path';
import {
  CachePreset,
  IconPipelineConfig,
  PackageInfo,
  PWAAutoConfig,
  ResolvedConfig,
  ResolvedIconPipelineConfig,
} from './types';

const DEFAULT_ICON_SIZES = [72, 96, 128, 144, 152, 192, 384, 512];

const CACHE_PRESETS: Record<CachePreset, Record<string, any>> = {
  default: {},
  static: {
    staticAssets: 'cacheFirst',
    images: 'staleWhileRevalidate',
    api: 'networkOnly',
    navigation: 'networkFirst',
    fonts: 'cacheFirst',
  },
  'api-first': {
    api: 'networkFirst',
    staticAssets: 'staleWhileRevalidate',
    images: 'networkFirst',
    fonts: 'cacheFirst',
    navigation: 'networkFirst',
  },
  readonly: {
    navigation: 'cacheOnly',
    staticAssets: 'cacheOnly',
    images: 'cacheOnly',
    api: 'networkOnly',
    fonts: 'cacheOnly',
  },
  'offline-first': {
    navigation: 'networkFirst',
    staticAssets: 'cacheFirst',
    images: 'staleWhileRevalidate',
    api: 'networkOnly',
    fonts: 'cacheFirst',
  },
};

const DEFAULTS: Omit<ResolvedConfig, 'projectRoot' | 'routerType' | 'packageInfo'> = {
  disable: false,
  offline: true,
  icon: null,
  icons: {
    maskable: true,
    sizes: [...DEFAULT_ICON_SIZES],
    themeVariants: [],
  },
  skipGeneratedIcons: false,
  manifest: {},
  workbox: {
    maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
    skipWaiting: true,
    clientsClaim: true,
    exclude: [/\.map$/, /^manifest.*\.js$/],
  },
  cacheStrategies: {
    navigation: 'networkFirst',
    staticAssets: 'cacheFirst',
    images: 'staleWhileRevalidate',
    api: 'networkOnly',
  },
  include: [],
  exclude: [],
  preset: 'default',
  pwaDir: '_pwa',
  disableInDev: true,
  swDest: 'sw.js',
  scope: '/',
};

export function resolveConfig(userConfig: PWAAutoConfig = {}): ResolvedConfig {
  const projectRoot = process.cwd();
  const packageInfo = readPackageJson(projectRoot);
  const routerType = detectRouterType(projectRoot);
  const cliIcon = process.env.NEXT_PWA_AUTO_ICON?.trim();
  const resolvedPreset = getPreset(userConfig.preset);

  return {
    disable: userConfig.disable ?? DEFAULTS.disable,
    offline: userConfig.offline ?? DEFAULTS.offline,
    icon: cliIcon ? cliIcon : userConfig.icon ?? DEFAULTS.icon,
    icons: resolveIconPipeline(userConfig.icons, DEFAULTS.icons),
    skipGeneratedIcons: userConfig.skipGeneratedIcons ?? DEFAULTS.skipGeneratedIcons,
    manifest: { ...DEFAULTS.manifest, ...userConfig.manifest },
    workbox: { ...DEFAULTS.workbox, ...userConfig.workbox },
    cacheStrategies: {
      ...DEFAULTS.cacheStrategies,
      ...(resolvedPreset ? CACHE_PRESETS[resolvedPreset] : {}),
      ...userConfig.cacheStrategies,
    },
    preset: resolvedPreset ?? DEFAULTS.preset,
    include: [...(userConfig.include ?? DEFAULTS.include)],
    exclude: [...(userConfig.exclude ?? DEFAULTS.exclude)],
    pwaDir: userConfig.pwaDir ?? DEFAULTS.pwaDir,
    disableInDev: userConfig.disableInDev ?? DEFAULTS.disableInDev,
    swDest: userConfig.swDest ?? DEFAULTS.swDest,
    scope: userConfig.scope ?? DEFAULTS.scope,
    projectRoot,
    routerType,
    packageInfo,
  };
}

function resolveIconPipeline(
  userIcons: IconPipelineConfig | undefined,
  defaults: ResolvedIconPipelineConfig
): ResolvedIconPipelineConfig {
  return {
    maskable: userIcons?.maskable ?? defaults.maskable,
    sizes: normalizeIconSizes(userIcons?.sizes, defaults.sizes),
    themeVariants: normalizeThemeVariants(userIcons?.themeVariants),
  };
}

function normalizeIconSizes(sizes: number[] | undefined, defaults: number[]): number[] {
  if (!Array.isArray(sizes) || sizes.length === 0) {
    return [...defaults];
  }

  const normalized = Array.from(
    new Set(
      sizes
        .map((size) => (Number.isFinite(size) ? Math.round(size) : 0))
        .filter((size) => size >= 32 && size <= 1024)
    )
  ).sort((a, b) => a - b);

  return normalized.length > 0 ? normalized : [...defaults];
}

function normalizeThemeVariants(
  themeVariants: IconPipelineConfig['themeVariants']
): ResolvedIconPipelineConfig['themeVariants'] {
  if (!Array.isArray(themeVariants)) {
    return [];
  }

  return themeVariants
    .filter(
      (variant): variant is { name: string; themeColor: string } =>
        Boolean(
          variant &&
            typeof variant.name === 'string' &&
            variant.name.trim() &&
            typeof variant.themeColor === 'string' &&
            variant.themeColor.trim()
        )
    )
    .map((variant) => ({
      name: variant.name.trim(),
      themeColor: variant.themeColor.trim(),
    }));
}

export function readPackageJson(projectRoot: string): PackageInfo {
  const pkgPath = path.join(projectRoot, 'package.json');
  const fallback: PackageInfo = {
    name: path.basename(projectRoot),
    description: '',
    version: '0.0.0',
    keywords: [],
  };

  try {
    const raw = fs.readFileSync(pkgPath, 'utf-8');
    const pkg = JSON.parse(raw);

    return {
      name: pkg.name || fallback.name,
      description: pkg.description || fallback.description,
      version: pkg.version || fallback.version,
      keywords: Array.isArray(pkg.keywords)
        ? pkg.keywords.filter((keyword: unknown): keyword is string => typeof keyword === 'string')
        : [],
    };
  } catch {
    return fallback;
  }
}

function getPreset(preset?: string): CachePreset | null {
  if (!preset || !Object.prototype.hasOwnProperty.call(CACHE_PRESETS, preset)) {
    return null;
  }
  return preset as CachePreset;
}

export function detectRouterType(projectRoot: string): 'app' | 'pages' {
  const hasApp =
    fs.existsSync(path.join(projectRoot, 'app')) ||
    fs.existsSync(path.join(projectRoot, 'src', 'app'));
  if (hasApp) return 'app';
  return 'pages';
}

export function isNextProject(projectRoot: string): boolean {
  const packagePath = path.join(projectRoot, 'package.json');
  try {
    const raw = JSON.parse(fs.readFileSync(packagePath, 'utf-8'));
    const deps = { ...raw.dependencies, ...raw.devDependencies };
    return typeof deps?.next === 'string';
  } catch {
    return false;
  }
}

export function getPublicDir(projectRoot: string): string {
  return path.join(projectRoot, 'public');
}

export function getPwaOutputDir(config: ResolvedConfig): string {
  return path.join(getPublicDir(config.projectRoot), config.pwaDir);
}

export function formatAppName(name: string): string {
  return name
    .replace(/^@[^/]+\//, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}
